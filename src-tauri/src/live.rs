//! `live_snapshot`：基于 sysinfo 的实时监控采样。
//!
//! 状态放在进程级 `OnceLock<Mutex<...>>` 里：sysinfo 的 CPU 占用是两次刷新之间的差值，
//! 网络速率也需要「上次累计字节 + 时间戳」才能算出来，所以必须跨调用保存。

use crate::types::LiveSnapshot;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Networks, RefreshKind, System};

/// 两次网络采样间隔低于这个值时不计算速率（首帧、双击刷新时会除以接近 0 的数）。
const MIN_NET_SAMPLE_SECS: f64 = 0.2;

/// 判定「虚拟网卡」的关键字（全部小写，匹配时把网卡名转小写）。
///
/// 为什么必须过滤：sysinfo 的 `total_received()` 是**所有**接口的累计值，虚拟网卡
/// （VMware/VirtualBox 的 host-only 网段、Teredo 隧道、loopback、VPN 的 TAP 适配器）
/// 的流量会被重复计入，导致监控面板的网速明显偏高甚至出现幽灵流量。
/// 这里只做名字匹配，不引额外的网卡类型 API，代价最小。
const VIRTUAL_ADAPTER_MARKERS: &[&str] = &[
    "loopback",
    "terredo", // 兜底：个别驱动把 Teredo 拼成 Teredo/Teredo，两个都列上
    "teredo",
    "isatap",
    "6to4",
    "vmware",
    "vmnet",
    "virtualbox",
    "vbox",
    "hyper-v",
    "vethernet",
    "radmin",
    "tap-",
    "tap ",
    "openvpn",
    "wireguard",
    "zerotier",
    "tailscale",
    "hamachi",
    "npcap",
    "loopback pseudo-interface",
];

struct LiveState {
    system: System,
    networks: Networks,
    last_rx: u64,
    last_tx: u64,
    last_net_at: Instant,
    /// 上一次成功算出 CPU 占用的时刻。
    ///
    /// sysinfo 的 CPU 占用是「两次刷新之间的差值」，如果两次刷新间隔远小于
    /// `MINIMUM_CPU_UPDATE_INTERVAL`（200ms），分母≈0，会算出 100% 这种假值。
    /// 首帧就是典型场景：`state()` 里刚 refresh 完，几微秒后 `snapshot()` 又 refresh 一次。
    last_cpu_at: Instant,
}

static LIVE_STATE: OnceLock<Mutex<LiveState>> = OnceLock::new();

/// 取全局状态的锁，**中毒也要能继续用**。
///
/// 原来 `.lock()` 返回 Err 就直接把错误抛给前端，只要有一次 panic 发生在持锁期间
/// （哪怕 panic 的是别的线程里的无关代码路径），后续每一次 `live_snapshot` 都会失败，
/// 监控页就永久停在错误态。这里用 `into_inner()` 从中毒状态恢复：
/// 状态里只有采样缓存，没有「必须保持一致」的跨字段不变量，继续用是安全的。
fn lock_state() -> MutexGuard<'static, LiveState> {
    match state().lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn state() -> &'static Mutex<LiveState> {
    LIVE_STATE.get_or_init(|| {
        // —— 为什么不用 System::new_all() ——
        // `new_all()` = `RefreshKind::everything()`，会枚举全系统进程。实测 359ms~1.13s，
        // 而监控页只需要 CPU + 内存。这里只刷新这两块，首帧快一个数量级。
        let system = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        );
        let networks = Networks::new_with_refreshed_list();
        let (rx, tx) = net_totals(&networks);
        Mutex::new(LiveState {
            system,
            networks,
            last_rx: rx,
            last_tx: tx,
            last_net_at: Instant::now(),
            last_cpu_at: Instant::now(),
        })
    })
}

/// 所有**物理**网卡的累计收/发字节数（虚拟网卡会被跳过，见 `VIRTUAL_ADAPTER_MARKERS`）。
fn net_totals(networks: &Networks) -> (u64, u64) {
    let mut rx: u64 = 0;
    let mut tx: u64 = 0;
    for (name, data) in networks.iter() {
        if is_virtual_adapter(name) {
            continue;
        }
        // 网卡可能被拔掉/重插，累计值理论上会回退，用 saturating 防止下溢。
        rx = rx.saturating_add(data.total_received());
        tx = tx.saturating_add(data.total_transmitted());
    }
    (rx, tx)
}

/// 网卡名是否属于「不该计入网速」的虚拟/隧道接口。
///
/// 大小写不敏感：Windows 上同一类适配器可能叫 `VMware Network Adapter VMnet8`
/// 也可能叫 `vmware network adapter vmnet8`，取决于驱动。
fn is_virtual_adapter(name: &str) -> bool {
    let lower = name.to_lowercase();
    VIRTUAL_ADAPTER_MARKERS
        .iter()
        .any(|marker| lower.contains(marker))
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
    let mut guard = lock_state();
    let st = &mut *guard;

    // —— P1-4：频率必须一起刷新 ——
    // `refresh_cpu_usage()` 内部是 `CpuRefreshKind::nothing().with_cpu_usage()`，
    // **不含 frequency**。所以原来监控页的 CPU 频率从首帧之后就永远不再更新。
    // 显式指定「占用 + 频率」两个都要。
    st.system
        .refresh_cpu_specifics(CpuRefreshKind::nothing().with_cpu_usage().with_frequency());
    st.system.refresh_memory();
    st.networks.refresh(true);

    // —— P1-5：首帧/高频刷新时的假 100% ——
    // sysinfo 的占用率是两次采样之间的差值；两次刷新间隔远小于
    // `MINIMUM_CPU_UPDATE_INTERVAL`（200ms）时分母≈0，算出来就是 100%。
    // 首帧尤其明显：`state()` 刚 refresh 完，微秒内又 refresh 一次。
    // 处理：间隔不足一个最小窗口时，这一帧直接报 0（并在下面注释说明），
    // 同时**不更新基线时间**，让下一帧能拿到足够长的采样窗口。
    let now = Instant::now();
    let cpu_window = now.duration_since(st.last_cpu_at);
    let cpu_window_ok = cpu_window >= sysinfo::MINIMUM_CPU_UPDATE_INTERVAL;
    if cpu_window_ok {
        st.last_cpu_at = now;
    }

    // —— CPU ——
    let cpus = st.system.cpus();
    let cpu_per_core: Vec<f64> = if cpu_window_ok {
        cpus.iter()
            .map(|cpu| round1(f64::from(cpu.cpu_usage())))
            .collect()
    } else {
        // 采样窗口不足：宁可显示 0，也不要把 100% 这种假值甩给用户。
        cpus.iter().map(|_| 0.0).collect()
    };
    let cpu_usage = if cpu_window_ok {
        round1(f64::from(st.system.global_cpu_usage()))
    } else {
        0.0
    };
    let cpu_freq_mhz = if cpus.is_empty() {
        0.0
    } else {
        let total: u64 = cpus.iter().map(|cpu| cpu.frequency()).sum();
        round1(total as f64 / cpus.len() as f64)
    };

    // —— 网络：累计值差分 / 实际经过时间 ——
    let (rx, tx) = net_totals(&st.networks);
    let elapsed = now.duration_since(st.last_net_at).as_secs_f64();
    let (net_rx_bps, net_tx_bps) = if elapsed >= MIN_NET_SAMPLE_SECS {
        (
            rx.saturating_sub(st.last_rx) as f64 / elapsed,
            tx.saturating_sub(st.last_tx) as f64 / elapsed,
        )
    } else {
        // —— 采样窗口太短：这一帧报 0，但**不更新基线** ——
        // 原来的写法无条件更新 last_rx/last_tx/last_net_at，于是这段流量被「吃掉」，
        // 下一帧只能算到基线之后的部分，网速凭空掉一截（甚至掉到 0）。
        // 保持基线不动，把这一整段窗口留到下一次采样一起算。
        (0.0, 0.0)
    };
    if elapsed >= MIN_NET_SAMPLE_SECS {
        st.last_rx = rx;
        st.last_tx = tx;
        st.last_net_at = now;
    }

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
