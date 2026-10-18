//! `live_snapshot`：基于 sysinfo 的实时监控采样。
//!
//! 状态放在进程级 `OnceLock<Mutex<...>>` 里：sysinfo 的 CPU 占用是两次刷新之间的差值，
//! 网络速率也需要「上次累计字节 + 时间戳」才能算出来，所以必须跨调用保存。

use crate::types::LiveSnapshot;
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Networks, System};

/// 两次网络采样间隔低于这个值时不计算速率（首帧、双击刷新时会除以接近 0 的数）。
const MIN_NET_SAMPLE_SECS: f64 = 0.2;

struct LiveState {
    system: System,
    networks: Networks,
    last_rx: u64,
    last_tx: u64,
    last_net_at: Instant,
}

static LIVE_STATE: OnceLock<Mutex<LiveState>> = OnceLock::new();

fn state() -> &'static Mutex<LiveState> {
    LIVE_STATE.get_or_init(|| {
        let system = System::new_all();
        let networks = Networks::new_with_refreshed_list();
        let (rx, tx) = net_totals(&networks);
        Mutex::new(LiveState {
            system,
            networks,
            last_rx: rx,
            last_tx: tx,
            last_net_at: Instant::now(),
        })
    })
}

/// 所有网卡的累计收/发字节数。
fn net_totals(networks: &Networks) -> (u64, u64) {
    let mut rx: u64 = 0;
    let mut tx: u64 = 0;
    for (_name, data) in networks.iter() {
        // 网卡可能被拔掉/重插，累计值理论上会回退，用 saturating 防止下溢。
        rx = rx.saturating_add(data.total_received());
        tx = tx.saturating_add(data.total_transmitted());
    }
    (rx, tx)
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 单次采样，立即返回（不 sleep）。前端按 1000ms 轮询即可。
pub fn snapshot() -> Result<LiveSnapshot, String> {
    let mut guard = state()
        .lock()
        .map_err(|_| "实时监控状态异常（内部锁已损坏）".to_string())?;
    let st = &mut *guard;

    st.system.refresh_cpu_usage();
    st.system.refresh_memory();
    st.networks.refresh(true);

    // —— CPU ——
    let cpus = st.system.cpus();
    let cpu_per_core: Vec<f64> = cpus
        .iter()
        .map(|cpu| round1(f64::from(cpu.cpu_usage())))
        .collect();
    let cpu_usage = round1(f64::from(st.system.global_cpu_usage()));
    let cpu_freq_mhz = if cpus.is_empty() {
        0.0
    } else {
        let total: u64 = cpus.iter().map(|cpu| cpu.frequency()).sum();
        round1(total as f64 / cpus.len() as f64)
    };

    // —— 网络：累计值差分 / 实际经过时间 ——
    let (rx, tx) = net_totals(&st.networks);
    let now = Instant::now();
    let elapsed = now.duration_since(st.last_net_at).as_secs_f64();
    let (net_rx_bps, net_tx_bps) = if elapsed >= MIN_NET_SAMPLE_SECS {
        (
            rx.saturating_sub(st.last_rx) as f64 / elapsed,
            tx.saturating_sub(st.last_tx) as f64 / elapsed,
        )
    } else {
        (0.0, 0.0)
    };
    st.last_rx = rx;
    st.last_tx = tx;
    st.last_net_at = now;

    let used_memory = st.system.used_memory();
    let total_memory = st.system.total_memory();
    let used_swap = st.system.used_swap();
    let total_swap = st.system.total_swap();

    Ok(LiveSnapshot {
        ts: unix_millis(),
        cpu_usage,
        cpu_per_core,
        cpu_freq_mhz,
        mem_used_bytes: used_memory,
        mem_total_bytes: total_memory,
        swap_used_bytes: used_swap,
        swap_total_bytes: total_swap,
        net_rx_bps,
        net_tx_bps,
        // sysinfo 不提供系统级磁盘 IO 统计（PerfMon 计数器才行），契约允许填 null，UI 会自动隐藏。
        disk_read_bps: None,
        disk_write_bps: None,
        uptime_sec: System::uptime(),
    })
}
