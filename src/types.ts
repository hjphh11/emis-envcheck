/**
 * ============================================================
 *  爱弥斯 · 环境检测 —— 数据契约（唯一真相来源）
 * ============================================================
 *
 * 规则（前后端都必须遵守）：
 *  1. 命名一律 camelCase。
 *  2. 容量/字节一律 number，单位 bytes；频率单位 MHz；百分比 0–100 的 number（不是 0–1）。
 *  3. 时间一律 ISO-8601 本地时间字符串（例：2026-10-18T19:30:00+08:00）；
 *     拿不到就 null，**不要**用空字符串或 "N/A"。
 *  4. 字符串拿不到时用 null；数组拿不到时用 []；布尔拿不到时用 null（三态）。
 *  5. 由 PowerShell 采集器产出的 JSON 必须能被本文件的
 *     `ScanResult` 直接反序列化（Rust 侧只做透明转发 + 少量补算）。
 *  6. 本文件由 Lead 维护，改字段必须先改这里，并在 docs/数据契约.md 同步。
 */

/** 单项检测结论 */
export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

/** 采集元信息 */
export interface ScanMeta {
  /** 采集耗时（毫秒） */
  scanMs: number;
  /** 采集生成时间 ISO */
  generatedAt: string;
  /** 是否以管理员身份运行 */
  isAdmin: boolean;
  /** 提权后能多拿到什么（给界面提示用），普通权限下非空 */
  elevationGains: string[];
  /** 采集过程中遇到的非致命问题（哪一项为什么没采到） */
  warnings: string[];
  /** 采集器版本，写死在 scan.ps1 顶部 */
  collectorVersion: string;
}

/** —— 1. 操作系统 —— */
export interface SystemInfo {
  /** 如 "Windows 11 专业工作站版" */
  caption: string;
  /** 如 "Microsoft Windows 11 专业工作站版" */
  osName: string;
  /** 如 "10.0.26100" */
  version: string;
  /** 如 "26100" */
  build: string;
  /** UBR 修订号，如 "3487" */
  ubr: string | null;
  /** 功能更新代号，如 "24H2"（注册表 DisplayVersion） */
  displayVersion: string | null;
  /** "x64" / "ARM64" / "x86" */
  arch: string;
  /** 安装日期 ISO */
  installDate: string | null;
  /** 上次启动 ISO */
  lastBoot: string | null;
  /** 已运行秒数 */
  uptimeSec: number;
  /** 激活状态文案："已激活" / "未激活" / "未知" */
  activation: string | null;
  /** 激活类型："OEM" / "Retail" / "Volume" / null */
  activationType: string | null;
  /** 电源计划名称 */
  powerPlan: string | null;
  /** 快速启动 */
  fastStartup: boolean | null;
  /** 系统盘 BitLocker 状态文案 */
  bitLocker: string | null;
  /** 是否启用 Hyper-V */
  hyperV: boolean | null;
  /** 整机厂商 */
  manufacturer: string | null;
  /** 整机型号 */
  model: string | null;
  /** 整机序列号 */
  serial: string | null;
  /** 域 / 工作组 */
  domain: string | null;
  /** 时区 */
  timeZone: string | null;
  /** 计算机名 */
  hostname: string;
  /** 当前用户名 */
  username: string;
  /** 显示分辨率 "2560x1440"（主屏） */
  resolution: string | null;
  /** 主屏刷新率 Hz */
  refreshHz: number | null;
}

/** —— 2. 主板 / BIOS / 安全芯片 —— */
export interface MotherboardInfo {
  vendor: string | null;
  model: string | null;
  version: string | null;
  serial: string | null;
  biosVendor: string | null;
  biosVersion: string | null;
  biosDate: string | null;
  /** 固件类型："UEFI" / "Legacy" */
  firmwareMode: string | null;
  secureBoot: boolean | null;
  /** TPM 版本，如 "2.0"；没有 TPM 为 null */
  tpmVersion: string | null;
  tpmEnabled: boolean | null;
}

/** —— 3. CPU —— */
export interface CpuInfo {
  /** 完整型号串，如 "AMD Ryzen 7 7840HS w/ Radeon 780M Graphics" */
  brand: string;
  vendor: string | null;
  physicalCores: number | null;
  logicalCores: number | null;
  baseMhz: number | null;
  maxMhz: number | null;
  /** 当前主频（采集瞬间） */
  currentMhz: number | null;
  /** L2 缓存 bytes（总量） */
  l2Bytes: number | null;
  /** L3 缓存 bytes */
  l3Bytes: number | null;
  socket: string | null;
  virtualization: boolean | null;
  /** 指令集标志，如 ["SSE4.2","AVX2","AES-NI"] */
  instructions: string[];
  /** 处理器架构，如 "x64" */
  arch: string | null;
  /** 采集瞬间总体占用 0-100 */
  usagePct: number | null;
}

/** —— 4. 内存 —— */
export interface MemoryModule {
  slot: string | null;
  manufacturer: string | null;
  partNumber: string | null;
  serial: string | null;
  capacityBytes: number | null;
  /** 标称频率（额定） */
  ratedMhz: number | null;
  /** 实际运行频率（ConfiguredClockSpeed） */
  speedMhz: number | null;
  /** "DDR5" / "DDR4" / "LPDDR5" */
  type: string | null;
  formFactor: string | null;
  voltageMv: number | null;
}

export interface MemoryInfo {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usedPct: number;
  modules: MemoryModule[];
  /** 是否检测到双通道（模块数 ≥2 且总容量对称的粗略判断） */
  dualChannelHint: boolean | null;
}

/** —— 5. 显卡 / 显示 —— */
export interface GpuInfo {
  name: string;
  vendor: string | null;
  /** 显存 bytes（WMI AdapterRAM 在 >4GB 时不准，采集器需用注册表/其他方式修正） */
  vramBytes: number | null;
  driverVersion: string | null;
  driverDate: string | null;
  /** 是否独显（启发式） */
  discrete: boolean | null;
  status: string | null;
}

export interface DisplayInfo {
  /** 显示器名称（EDID 友好名） */
  name: string | null;
  manufacturer: string | null;
  /** "2560x1440" */
  resolution: string | null;
  refreshHz: number | null;
  /** 对角尺寸英寸 */
  sizeInch: number | null;
  /** 是否主显示器 */
  primary: boolean;
}

/** —— 6. 硬盘 —— */
export interface VolumeInfo {
  /** "C:" */
  drive: string;
  label: string | null;
  fs: string | null;
  totalBytes: number;
  freeBytes: number;
}

export type DiskHealth = "healthy" | "warning" | "critical" | "unknown";

export interface DiskInfo {
  /** 物理盘型号 */
  model: string;
  vendor: string | null;
  serial: string | null;
  firmware: string | null;
  /** "NVMe" / "SATA" / "USB" / "SCSI" */
  interfaceType: string | null;
  /** "SSD" / "HDD" / "eMMC" / null（未知） */
  mediaType: string | null;
  totalBytes: number | null;
  health: DiskHealth;
  /** 健康度百分比 0-100（NVMe 寿命 / SSD 剩余寿命；HDD 通常为 null） */
  healthPct: number | null;
  /** 温度 ℃（需管理员，拿不到 null） */
  temperatureC: number | null;
  /** 通电时间（小时） */
  powerOnHours: number | null;
  /** 通电次数 */
  powerCycles: number | null;
  /** 分区/卷 */
  volumes: VolumeInfo[];
}

/** —— 7. 网络 —— */
export interface NetworkAdapter {
  name: string;
  /** "以太网" / "WLAN" / "其他" */
  type: string;
  mac: string | null;
  ipv4: string | null;
  ipv6: string | null;
  gateway: string | null;
  dns: string[];
  /** 链路速率 Mbps */
  speedMbps: number | null;
  connected: boolean;
  /** Wi-Fi 名称 */
  ssid: string | null;
  /** Wi-Fi 信号 0-100 */
  signalPct: number | null;
}

export interface NetworkInfo {
  adapters: NetworkAdapter[];
  /** 是否连上外网 */
  internet: boolean | null;
  /** Ping 延迟 ms（失败 null） */
  latencyMs: number | null;
  /** DNS 解析是否正常 */
  dnsOk: boolean | null;
}

/** —— 8. 运行环境（B 页签核心） —— */
export interface ToolInfo {
  name: string;
  version: string | null;
  path: string | null;
  /** "path" 来自 PATH，"registry" 来自注册表，"dir" 来自常见目录扫描 */
  source: "path" | "registry" | "dir" | null;
}

export interface DotnetFrameworkInfo {
  /** "4.8.1" / "4.8" / "3.5" */
  version: string;
  /** 注册表 Release 值 */
  release: number | null;
  installed: boolean;
}

export interface DotnetRuntimeInfo {
  /** "Microsoft.NETCore.App" / "Microsoft.WindowsDesktop.App" */
  name: string;
  version: string;
}

export interface VcppRuntimeInfo {
  /** "2015-2022" */
  year: string;
  /** "x64" / "x86" */
  arch: string;
  version: string;
}

export interface DirectXInfo {
  /** "12" / "11" / "9.0c" */
  version: string | null;
  /** 主版本号（注册表） */
  major: number | null;
  /** d3d12.dll 是否存在 */
  d3d12: boolean | null;
  /** WDDM 版本号，如 "3.1" */
  wddm: string | null;
  /** 显卡驱动支持的最高特性级别（拿不到 null） */
  featureLevel: string | null;
}

export interface WslInfo {
  installed: boolean | null;
  version: string | null;
  distros: string[];
}

export interface RuntimeInfo {
  dotnetFramework: DotnetFrameworkInfo[];
  dotnetRuntimes: DotnetRuntimeInfo[];
  vcpp: VcppRuntimeInfo[];
  directx: DirectXInfo;
  webview2: { installed: boolean | null; version: string | null };
  java: ToolInfo[];
  node: ToolInfo | null;
  python: ToolInfo | null;
  git: ToolInfo | null;
  wsl: WslInfo;
  powershellVersion: string | null;
}

/** —— 9. 安全 —— */
export interface SecurityInfo {
  /** Defender 实时保护 */
  defenderRealtime: boolean | null;
  /** 第三方杀软名称（WMI SecurityCenter2） */
  antivirus: string[];
  /** 防火墙各配置文件状态 "已开启"/"已关闭" */
  firewall: string | null;
  secureBoot: boolean | null;
  tpm: string | null;
  uac: string | null;
}

/** —— 10. 兼容性体检（C 页签核心） —— */
export interface CompatItem {
  id: string;
  /** 检测项名称，如 "TPM 2.0" */
  name: string;
  status: CheckStatus;
  /** 实测值文案，如 "2.0" */
  actual: string;
  /** 要求文案，如 "需要 TPM 2.0" */
  requirement: string;
  /** 不通过 / 警告的原因说明（pass 时为 null） */
  reason: string | null;
  /** 附加建议或补充说明 */
  detail: string | null;
}

export interface CompatResult {
  /** 结论："ok" 可升级 / "warn" 有风险 / "blocked" 不满足 */
  verdict: "ok" | "warn" | "blocked";
  passCount: number;
  warnCount: number;
  failCount: number;
  unknownCount: number;
  items: CompatItem[];
}

/** —— 11. 健康评分 —— */
export interface ScorePart {
  key: "cpu" | "memory" | "storage" | "gpu" | "system";
  label: string;
  /** 0-100 */
  score: number;
  /** 权重 0-1，五项之和为 1 */
  weight: number;
  /** 一句话依据，如 "单核/多核性能与世代综合" */
  note: string;
}

export interface HealthScore {
  total: number;
  level: "excellent" | "good" | "fair" | "poor";
  parts: ScorePart[];
}

/** —— 12. 汇总 —— */
export interface ScanResult {
  meta: ScanMeta;
  system: SystemInfo;
  motherboard: MotherboardInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpus: GpuInfo[];
  displays: DisplayInfo[];
  disks: DiskInfo[];
  network: NetworkInfo;
  runtime: RuntimeInfo;
  security: SecurityInfo;
  compat: CompatResult;
  score: HealthScore;
}

/** —— 13. 实时监控快照（每秒一次） —— */
export interface LiveSnapshot {
  /** 采样时间戳 ms */
  ts: number;
  cpuUsage: number;
  cpuPerCore: number[];
  cpuFreqMhz: number;
  memUsedBytes: number;
  memTotalBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  netRxBps: number;
  netTxBps: number;
  /** 磁盘总读写速率（拿不到时 null，UI 需隐藏该项） */
  diskReadBps: number | null;
  diskWriteBps: number | null;
  uptimeSec: number;
}

/** —— 14. 应用信息 —— */
export interface AppInfo {
  name: string;
  version: string;
  /** 制作者 */
  author: string;
  homepage: string;
  buildDate: string;
}
