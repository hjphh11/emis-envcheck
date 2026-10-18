//! 数据契约的 Rust 镜像 —— 与 `src/types.ts` 一一对应。
//!
//! 设计原则：
//! 1. 字段名/序列化名与 TS 完全一致（camelCase），前端可直接 `invoke` 结果当 `ScanResult` 用。
//! 2. 反序列化**尽量宽容**：采集器（PowerShell）可能把数字写成字符串、把拿不到的项写成 `null`
//!    或直接省略字段；这里统一用宽松辅助函数兜底，避免一个字段类型不对就把整次扫描判死。
//! 3. 枚举（CheckStatus / DiskHealth / verdict / level / key / source）用 `String` 透传，
//!    不在这里做值校验 —— 契约由采集器保证，Rust 只做透明转发。

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

// ============================================================
// 宽松反序列化辅助
// ============================================================

fn as_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn as_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

fn as_u64(v: &Value) -> Option<u64> {
    let from_f64 = |f: f64| -> u64 {
        if f.is_finite() && f > 0.0 {
            f.round() as u64
        } else {
            0
        }
    };
    match v {
        Value::Number(n) => n.as_u64().or_else(|| n.as_f64().map(from_f64)),
        Value::String(s) => {
            let s = s.trim();
            s.parse::<u64>()
                .ok()
                .or_else(|| s.parse::<f64>().ok().map(from_f64))
        }
        Value::Bool(b) => Some(u64::from(*b)),
        _ => None,
    }
}

fn as_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Bool(b) => Some(*b),
        Value::Number(n) => n.as_f64().map(|f| f != 0.0),
        Value::String(s) => match s.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" | "是" => Some(true),
            "false" | "0" | "no" | "否" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn de_opt_string<'de, D: Deserializer<'de>>(de: D) -> Result<Option<String>, D::Error> {
    Ok(Option::<Value>::deserialize(de)?.as_ref().and_then(as_string))
}

fn de_string<'de, D: Deserializer<'de>>(de: D) -> Result<String, D::Error> {
    Ok(de_opt_string(de)?.unwrap_or_default())
}

fn de_opt_f64<'de, D: Deserializer<'de>>(de: D) -> Result<Option<f64>, D::Error> {
    Ok(Option::<Value>::deserialize(de)?.as_ref().and_then(as_f64))
}

fn de_f64<'de, D: Deserializer<'de>>(de: D) -> Result<f64, D::Error> {
    Ok(de_opt_f64(de)?.unwrap_or(0.0))
}

fn de_opt_u64<'de, D: Deserializer<'de>>(de: D) -> Result<Option<u64>, D::Error> {
    Ok(Option::<Value>::deserialize(de)?.as_ref().and_then(as_u64))
}

fn de_u64<'de, D: Deserializer<'de>>(de: D) -> Result<u64, D::Error> {
    Ok(de_opt_u64(de)?.unwrap_or(0))
}

fn de_opt_bool<'de, D: Deserializer<'de>>(de: D) -> Result<Option<bool>, D::Error> {
    Ok(Option::<Value>::deserialize(de)?.as_ref().and_then(as_bool))
}

fn de_bool<'de, D: Deserializer<'de>>(de: D) -> Result<bool, D::Error> {
    Ok(de_opt_bool(de)?.unwrap_or(false))
}

/// 数组字段：缺失 / `null` 都当空数组，避免整次扫描失败。
fn de_vec<'de, D: Deserializer<'de>, T: Deserialize<'de>>(de: D) -> Result<Vec<T>, D::Error> {
    Ok(Option::<Vec<T>>::deserialize(de)?.unwrap_or_default())
}

/// 必填子对象：缺失 / `null` 都当默认值。
fn de_struct<'de, D: Deserializer<'de>, T: Deserialize<'de> + Default>(
    de: D,
) -> Result<T, D::Error> {
    Ok(Option::<T>::deserialize(de)?.unwrap_or_default())
}

// ============================================================
// 1. 采集元信息
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ScanMeta {
    /// 采集耗时（毫秒），由 Rust 用真实耗时覆盖
    #[serde(deserialize_with = "de_f64")]
    pub scan_ms: f64,
    /// 采集生成时间 ISO-8601（本地时间，带偏移），由 Rust 覆盖
    #[serde(deserialize_with = "de_string")]
    pub generated_at: String,
    /// 是否以管理员身份运行（Rust 用系统 API 复核后覆盖）
    #[serde(deserialize_with = "de_bool")]
    pub is_admin: bool,
    #[serde(deserialize_with = "de_vec")]
    pub elevation_gains: Vec<String>,
    #[serde(deserialize_with = "de_vec")]
    pub warnings: Vec<String>,
    #[serde(deserialize_with = "de_string")]
    pub collector_version: String,
}

// ============================================================
// 2. 操作系统
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SystemInfo {
    #[serde(deserialize_with = "de_string")]
    pub caption: String,
    #[serde(deserialize_with = "de_string")]
    pub os_name: String,
    #[serde(deserialize_with = "de_string")]
    pub version: String,
    #[serde(deserialize_with = "de_string")]
    pub build: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub ubr: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub display_version: Option<String>,
    #[serde(deserialize_with = "de_string")]
    pub arch: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub install_date: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub last_boot: Option<String>,
    #[serde(deserialize_with = "de_u64")]
    pub uptime_sec: u64,
    #[serde(deserialize_with = "de_opt_string")]
    pub activation: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub activation_type: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub power_plan: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub fast_startup: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub bit_locker: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub hyper_v: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub manufacturer: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub model: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub serial: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub domain: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub time_zone: Option<String>,
    #[serde(deserialize_with = "de_string")]
    pub hostname: String,
    #[serde(deserialize_with = "de_string")]
    pub username: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub resolution: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub refresh_hz: Option<f64>,
}

// ============================================================
// 3. 主板 / BIOS / 安全芯片
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MotherboardInfo {
    #[serde(deserialize_with = "de_opt_string")]
    pub vendor: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub model: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub version: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub serial: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub bios_vendor: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub bios_version: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub bios_date: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub firmware_mode: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub secure_boot: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub tpm_version: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub tpm_enabled: Option<bool>,
}

// ============================================================
// 4. CPU
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CpuInfo {
    #[serde(deserialize_with = "de_string")]
    pub brand: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub vendor: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub physical_cores: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub logical_cores: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub base_mhz: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub max_mhz: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub current_mhz: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub l2_bytes: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub l3_bytes: Option<f64>,
    #[serde(deserialize_with = "de_opt_string")]
    pub socket: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub virtualization: Option<bool>,
    #[serde(deserialize_with = "de_vec")]
    pub instructions: Vec<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub arch: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub usage_pct: Option<f64>,
}

// ============================================================
// 5. 内存
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MemoryModule {
    #[serde(deserialize_with = "de_opt_string")]
    pub slot: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub manufacturer: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub part_number: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub serial: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub capacity_bytes: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub rated_mhz: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub speed_mhz: Option<f64>,
    #[serde(deserialize_with = "de_opt_string")]
    pub r#type: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub form_factor: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub voltage_mv: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MemoryInfo {
    #[serde(deserialize_with = "de_f64")]
    pub total_bytes: f64,
    #[serde(deserialize_with = "de_f64")]
    pub available_bytes: f64,
    #[serde(deserialize_with = "de_f64")]
    pub used_bytes: f64,
    #[serde(deserialize_with = "de_f64")]
    pub used_pct: f64,
    #[serde(deserialize_with = "de_vec")]
    pub modules: Vec<MemoryModule>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub dual_channel_hint: Option<bool>,
}

// ============================================================
// 6. 显卡 / 显示
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GpuInfo {
    #[serde(deserialize_with = "de_string")]
    pub name: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub vendor: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub vram_bytes: Option<f64>,
    #[serde(deserialize_with = "de_opt_string")]
    pub driver_version: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub driver_date: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub discrete: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DisplayInfo {
    #[serde(deserialize_with = "de_opt_string")]
    pub name: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub manufacturer: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub resolution: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub refresh_hz: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub size_inch: Option<f64>,
    #[serde(deserialize_with = "de_bool")]
    pub primary: bool,
}

// ============================================================
// 7. 硬盘 / 卷
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VolumeInfo {
    #[serde(deserialize_with = "de_string")]
    pub drive: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub label: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub fs: Option<String>,
    #[serde(deserialize_with = "de_f64")]
    pub total_bytes: f64,
    #[serde(deserialize_with = "de_f64")]
    pub free_bytes: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DiskInfo {
    #[serde(deserialize_with = "de_string")]
    pub model: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub vendor: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub serial: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub firmware: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub interface_type: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub media_type: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub total_bytes: Option<f64>,
    /// "healthy" / "warning" / "critical" / "unknown"
    #[serde(deserialize_with = "de_string")]
    pub health: String,
    #[serde(deserialize_with = "de_opt_f64")]
    pub health_pct: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub temperature_c: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub power_on_hours: Option<f64>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub power_cycles: Option<f64>,
    #[serde(deserialize_with = "de_vec")]
    pub volumes: Vec<VolumeInfo>,
}

// ============================================================
// 8. 网络
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NetworkAdapter {
    #[serde(deserialize_with = "de_string")]
    pub name: String,
    #[serde(deserialize_with = "de_string")]
    pub r#type: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub mac: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub ipv4: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub ipv6: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub gateway: Option<String>,
    #[serde(deserialize_with = "de_vec")]
    pub dns: Vec<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub speed_mbps: Option<f64>,
    #[serde(deserialize_with = "de_bool")]
    pub connected: bool,
    #[serde(deserialize_with = "de_opt_string")]
    pub ssid: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub signal_pct: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NetworkInfo {
    #[serde(deserialize_with = "de_vec")]
    pub adapters: Vec<NetworkAdapter>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub internet: Option<bool>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub latency_ms: Option<f64>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub dns_ok: Option<bool>,
}

// ============================================================
// 9. 运行环境
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ToolInfo {
    #[serde(deserialize_with = "de_string")]
    pub name: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub version: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub path: Option<String>,
    /// "path" / "registry" / "dir"
    #[serde(deserialize_with = "de_opt_string")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DotnetFrameworkInfo {
    #[serde(deserialize_with = "de_string")]
    pub version: String,
    #[serde(deserialize_with = "de_opt_f64")]
    pub release: Option<f64>,
    #[serde(deserialize_with = "de_bool")]
    pub installed: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DotnetRuntimeInfo {
    #[serde(deserialize_with = "de_string")]
    pub name: String,
    #[serde(deserialize_with = "de_string")]
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VcppRuntimeInfo {
    #[serde(deserialize_with = "de_string")]
    pub year: String,
    #[serde(deserialize_with = "de_string")]
    pub arch: String,
    #[serde(deserialize_with = "de_string")]
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DirectXInfo {
    #[serde(deserialize_with = "de_opt_string")]
    pub version: Option<String>,
    #[serde(deserialize_with = "de_opt_f64")]
    pub major: Option<f64>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub d3d12: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub wddm: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub feature_level: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Webview2Info {
    #[serde(deserialize_with = "de_opt_bool")]
    pub installed: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WslInfo {
    #[serde(deserialize_with = "de_opt_bool")]
    pub installed: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub version: Option<String>,
    #[serde(deserialize_with = "de_vec")]
    pub distros: Vec<String>,
}

/// —— 8.1 已安装的第三方软件（数据库 / 容器 / Web 服务 / 语言 / 开发工具 / 常见软件） ——
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SoftwareItem {
    /// 展示名，如 "MySQL" / "Redis 3.0.504" / "Docker Desktop"
    #[serde(deserialize_with = "de_string")]
    pub name: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub version: Option<String>,
    /// 安装目录或可执行文件路径
    #[serde(deserialize_with = "de_opt_string")]
    pub path: Option<String>,
    /// "database" / "container" / "webServer" / "language" / "devTool" / "common"
    #[serde(deserialize_with = "de_string")]
    pub category: String,
    /// "registry" / "service" / "path" / "command" / "dir"
    #[serde(deserialize_with = "de_opt_string")]
    pub source: Option<String>,
    /// 后台服务 / 进程是否正在运行；非服务类软件为 null
    #[serde(deserialize_with = "de_opt_bool")]
    pub running: Option<bool>,
    /// 附加信息，如端口 "3306"、数据目录、"引擎 27.3.1"
    #[serde(deserialize_with = "de_opt_string")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RuntimeInfo {
    #[serde(deserialize_with = "de_vec")]
    pub dotnet_framework: Vec<DotnetFrameworkInfo>,
    #[serde(deserialize_with = "de_vec")]
    pub dotnet_runtimes: Vec<DotnetRuntimeInfo>,
    #[serde(deserialize_with = "de_vec")]
    pub vcpp: Vec<VcppRuntimeInfo>,
    #[serde(deserialize_with = "de_struct")]
    pub directx: DirectXInfo,
    #[serde(deserialize_with = "de_struct")]
    pub webview2: Webview2Info,
    #[serde(deserialize_with = "de_vec")]
    pub java: Vec<ToolInfo>,
    #[serde(deserialize_with = "de_struct")]
    pub node: Option<ToolInfo>,
    #[serde(deserialize_with = "de_struct")]
    pub python: Option<ToolInfo>,
    #[serde(deserialize_with = "de_struct")]
    pub git: Option<ToolInfo>,
    #[serde(deserialize_with = "de_struct")]
    pub wsl: WslInfo,
    #[serde(deserialize_with = "de_opt_string")]
    pub powershell_version: Option<String>,
    /// 已安装的第三方软件（v1.1 新增）。
    /// 老版本采集器不会输出该字段：缺失 / null 都按空数组兜底，前端会自动隐藏该分区。
    #[serde(deserialize_with = "de_vec")]
    pub software: Vec<SoftwareItem>,
}

// ============================================================
// 10. 安全
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SecurityInfo {
    #[serde(deserialize_with = "de_opt_bool")]
    pub defender_realtime: Option<bool>,
    #[serde(deserialize_with = "de_vec")]
    pub antivirus: Vec<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub firewall: Option<String>,
    #[serde(deserialize_with = "de_opt_bool")]
    pub secure_boot: Option<bool>,
    #[serde(deserialize_with = "de_opt_string")]
    pub tpm: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub uac: Option<String>,
}

// ============================================================
// 11. 兼容性体检
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CompatItem {
    #[serde(deserialize_with = "de_string")]
    pub id: String,
    #[serde(deserialize_with = "de_string")]
    pub name: String,
    /// "pass" / "warn" / "fail" / "unknown"
    #[serde(deserialize_with = "de_string")]
    pub status: String,
    #[serde(deserialize_with = "de_string")]
    pub actual: String,
    #[serde(deserialize_with = "de_string")]
    pub requirement: String,
    #[serde(deserialize_with = "de_opt_string")]
    pub reason: Option<String>,
    #[serde(deserialize_with = "de_opt_string")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CompatResult {
    /// "ok" / "warn" / "blocked"
    #[serde(deserialize_with = "de_string")]
    pub verdict: String,
    #[serde(deserialize_with = "de_f64")]
    pub pass_count: f64,
    #[serde(deserialize_with = "de_f64")]
    pub warn_count: f64,
    #[serde(deserialize_with = "de_f64")]
    pub fail_count: f64,
    #[serde(deserialize_with = "de_f64")]
    pub unknown_count: f64,
    #[serde(deserialize_with = "de_vec")]
    pub items: Vec<CompatItem>,
}

// ============================================================
// 12. 健康评分
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ScorePart {
    /// "cpu" / "memory" / "storage" / "gpu" / "system"
    #[serde(deserialize_with = "de_string")]
    pub key: String,
    #[serde(deserialize_with = "de_string")]
    pub label: String,
    #[serde(deserialize_with = "de_f64")]
    pub score: f64,
    #[serde(deserialize_with = "de_f64")]
    pub weight: f64,
    #[serde(deserialize_with = "de_string")]
    pub note: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HealthScore {
    #[serde(deserialize_with = "de_f64")]
    pub total: f64,
    /// "excellent" / "good" / "fair" / "poor"
    #[serde(deserialize_with = "de_string")]
    pub level: String,
    #[serde(deserialize_with = "de_vec")]
    pub parts: Vec<ScorePart>,
}

// ============================================================
// 13. 汇总（scan_all 返回值）
// ============================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ScanResult {
    #[serde(deserialize_with = "de_struct")]
    pub meta: ScanMeta,
    #[serde(deserialize_with = "de_struct")]
    pub system: SystemInfo,
    #[serde(deserialize_with = "de_struct")]
    pub motherboard: MotherboardInfo,
    #[serde(deserialize_with = "de_struct")]
    pub cpu: CpuInfo,
    #[serde(deserialize_with = "de_struct")]
    pub memory: MemoryInfo,
    #[serde(deserialize_with = "de_vec")]
    pub gpus: Vec<GpuInfo>,
    #[serde(deserialize_with = "de_vec")]
    pub displays: Vec<DisplayInfo>,
    #[serde(deserialize_with = "de_vec")]
    pub disks: Vec<DiskInfo>,
    #[serde(deserialize_with = "de_struct")]
    pub network: NetworkInfo,
    #[serde(deserialize_with = "de_struct")]
    pub runtime: RuntimeInfo,
    #[serde(deserialize_with = "de_struct")]
    pub security: SecurityInfo,
    #[serde(deserialize_with = "de_struct")]
    pub compat: CompatResult,
    #[serde(deserialize_with = "de_struct")]
    pub score: HealthScore,
}

// ============================================================
// 14. 实时监控快照（Rust 侧产出，前端每秒取一次）
// ============================================================

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSnapshot {
    /// 采样时间戳（Unix 毫秒）
    pub ts: u64,
    pub cpu_usage: f64,
    pub cpu_per_core: Vec<f64>,
    pub cpu_freq_mhz: f64,
    pub mem_used_bytes: u64,
    pub mem_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
    pub net_rx_bps: f64,
    pub net_tx_bps: f64,
    /// 磁盘总读速率（sysinfo 不提供系统级磁盘 IO，拿不到时为 null，UI 会隐藏）
    pub disk_read_bps: Option<f64>,
    pub disk_write_bps: Option<f64>,
    pub uptime_sec: u64,
}

// ============================================================
// 15. 应用信息（app_info 返回值）
// ============================================================

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub author: String,
    pub homepage: String,
    pub build_date: String,
}
