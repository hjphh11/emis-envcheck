/**
 * 浏览器预览用的假数据。
 * 只为了让 UI 脱离 Rust 也能开发/截图；桌面里永远走真实 scan_all。
 * 数值按「一台 2023 年的游戏本」编的，结构必须与 src/types.ts 完全一致。
 */
import type {
  AppInfo,
  CheckStatus,
  CompatItem,
  CompatResult,
  LiveSnapshot,
  ScanResult,
} from "../types";

const GB = 1024 ** 3;

/** 与真实采集器（scan.ps1）一致的 17 条检测项，id 用点分命名 */
const COMPAT_ITEMS: CompatItem[] = [
  { id: "c.arch.cpu64", name: "64 位处理器", status: "pass", actual: "64 位（x64）", requirement: "需要 64 位处理器（x64 / ARM64）", reason: null, detail: "处理器与系统均为 64 位" },
  { id: "c.cpu.model", name: "CPU 型号（Windows 11 支持列表）", status: "pass", actual: "AMD Ryzen 9 7940HS（Zen4）", requirement: "Intel 第 8 代及以上 / AMD Zen 2（Ryzen 2000 系列）及以上", reason: null, detail: "按代际规则命中 Windows 11 官方支持范围" },
  { id: "c.cpu.cores", name: "物理核心数", status: "pass", actual: "8 核 / 16 线程", requirement: "至少 2 个物理核心", reason: null, detail: "满足 Windows 11 最少核心要求" },
  { id: "c.cpu.clock", name: "处理器主频", status: "pass", actual: "4000 MHz", requirement: "不低于 1 GHz", reason: null, detail: "满足 Windows 11 最低主频要求" },
  { id: "c.mem.size", name: "内存容量", status: "pass", actual: "32 GB", requirement: "至少 4 GB（建议 8 GB 以上）", reason: null, detail: "满足 Windows 11 最低内存要求" },
  { id: "c.disk.space", name: "系统盘可用空间", status: "pass", actual: "212 GB 可用 / 476 GB 总容量", requirement: "至少 64 GB 可用空间", reason: null, detail: "满足 Windows 11 安装与更新所需空间" },
  { id: "c.fw.uefi", name: "UEFI 固件", status: "pass", actual: "UEFI", requirement: "需要 UEFI 引导模式", reason: null, detail: "当前为 UEFI 引导" },
  { id: "c.fw.secureboot", name: "安全启动（Secure Boot）", status: "pass", actual: "已启用", requirement: "需要支持并已启用 Secure Boot", reason: null, detail: "安全启动已启用" },
  { id: "c.fw.tpm", name: "TPM 2.0", status: "pass", actual: "TPM 2.0", requirement: "需要 TPM 2.0（可信平台模块）", reason: null, detail: "TPM 2.0 已启用" },
  { id: "c.gfx.dx12", name: "DirectX 12", status: "pass", actual: "支持（特性级别 12_1）", requirement: "需要显卡支持 DirectX 12（特性级别 12_0 及以上）", reason: null, detail: "显卡驱动支持 DirectX 12" },
  { id: "c.gfx.wddm", name: "WDDM 2.0 驱动模型", status: "pass", actual: "WDDM 3.1", requirement: "需要 WDDM 2.0 及以上显示驱动模型", reason: null, detail: "显示驱动模型满足要求" },
  { id: "c.display.basic", name: "显示设备", status: "pass", actual: "14 英寸 · 2560×1600", requirement: "对角线 ≥ 9 英寸，分辨率 ≥ 1280×720", reason: null, detail: "满足 Windows 11 显示要求" },
  { id: "c.cpu.sse42", name: "SSE4.2 / POPCNT 指令集", status: "pass", actual: "支持", requirement: "需要支持 SSE4.2 与 POPCNT 指令集", reason: null, detail: "处理器支持 Windows 11 24H2 所需指令集" },
  { id: "c.disk.gpt", name: "系统盘分区表", status: "pass", actual: "GPT", requirement: "建议使用 GPT 分区表", reason: null, detail: "系统盘为 GPT 分区表" },
  { id: "c.os.version", name: "操作系统版本", status: "pass", actual: "Windows 11（26100）", requirement: "Windows 10 2004（19041）及以上", reason: null, detail: "系统版本满足升级条件" },
  { id: "gpu.driver", name: "显卡驱动", status: "pass", actual: "32.0.15.7688（2026-06-12）", requirement: "需要已安装厂商显卡驱动（WDDM 2.0 及以上）", reason: null, detail: "驱动已正常安装，支持 DirectX 12 / WDDM 2.0+" },
  { id: "gpu.driverAge", name: "显卡驱动时效", status: "pass", actual: "2026-06-12（4 个月前）", requirement: "驱动发布日期不超过 18 个月", reason: null, detail: "驱动较新，未超过 18 个月" },
];

/** 四个计数与结论一律由 items 实际统计推导，不再手写，避免与条目自相矛盾 */
function summarizeCompat(items: CompatItem[]): CompatResult {
  const count = (s: CheckStatus) => items.filter((it) => it.status === s).length;
  const passCount = count("pass");
  const warnCount = count("warn");
  const failCount = count("fail");
  const unknownCount = count("unknown");
  const verdict: CompatResult["verdict"] =
    failCount > 0 ? "blocked" : warnCount > 0 ? "warn" : "ok";
  return { verdict, passCount, warnCount, failCount, unknownCount, items };
}

export function mockScan(): ScanResult {
  return {
    meta: {
      scanMs: 3120,
      generatedAt: new Date().toISOString(),
      isAdmin: false,
      elevationGains: ["CPU 温度 / 风扇转速", "硬盘 SMART 明细", "TPM 与 BitLocker 状态"],
      warnings: ["未以管理员运行：温度与 SMART 明细不可用"],
      collectorVersion: "1.1.0",
    },
    system: {
      caption: "Windows 11 专业工作站版",
      osName: "Microsoft Windows 11 专业工作站版",
      version: "10.0.26100",
      build: "26100",
      ubr: "3487",
      displayVersion: "24H2",
      arch: "x64",
      installDate: "2025-03-14T10:22:11+08:00",
      lastBoot: "2026-10-18T09:12:44+08:00",
      uptimeSec: 37482,
      activation: "已激活",
      activationType: "Retail",
      powerPlan: "平衡",
      fastStartup: true,
      bitLocker: "未加密",
      hyperV: false,
      manufacturer: "ASUSTeK COMPUTER INC.",
      model: "ROG Zephyrus G14 GA402XV",
      serial: "M3NRKD01X000000",
      domain: "WORKGROUP",
      timeZone: "China Standard Time",
      hostname: "EMIS-DESKTOP",
      username: "qingwu",
      resolution: "2560x1600",
      refreshHz: 165,
    },
    motherboard: {
      vendor: "ASUSTeK COMPUTER INC.",
      model: "GA402XV",
      version: "1.0",
      serial: "M3NRKD01X000000",
      biosVendor: "American Megatrends International, LLC.",
      biosVersion: "GA402XV.318",
      biosDate: "2025-08-19T00:00:00+08:00",
      firmwareMode: "UEFI",
      secureBoot: true,
      tpmVersion: "2.0",
      tpmEnabled: true,
    },
    cpu: {
      brand: "AMD Ryzen 9 7940HS w/ Radeon 780M Graphics",
      vendor: "AuthenticAMD",
      physicalCores: 8,
      logicalCores: 16,
      baseMhz: 4000,
      maxMhz: 5245,
      currentMhz: 4180,
      l2Bytes: 8 * 1024 * 1024,
      l3Bytes: 16 * 1024 * 1024,
      socket: "FP7",
      virtualization: true,
      instructions: ["SSE4.2", "AVX2", "AVX-512", "AES-NI", "FMA3"],
      arch: "x64",
      usagePct: 12.4,
    },
    memory: {
      totalBytes: 32 * GB,
      availableBytes: 18.2 * GB,
      usedBytes: 13.8 * GB,
      usedPct: 43.1,
      modules: [
        {
          slot: "DIMM 0",
          manufacturer: "Samsung",
          partNumber: "K3LKBKB0BM-MGCP",
          serial: "0x00000000",
          capacityBytes: 16 * GB,
          ratedMhz: 6400,
          speedMhz: 5600,
          type: "LPDDR5",
          formFactor: "SODIMM",
          voltageMv: 1100,
        },
      ],
      dualChannelHint: true,
    },
    gpus: [
      {
        name: "NVIDIA GeForce RTX 4060 Laptop GPU",
        vendor: "NVIDIA",
        vramBytes: 8 * GB,
        driverVersion: "32.0.15.7688",
        driverDate: "2026-06-12T00:00:00+08:00",
        discrete: true,
        status: "OK",
      },
      {
        name: "AMD Radeon 780M Graphics",
        vendor: "AMD",
        vramBytes: 512 * 1024 * 1024,
        driverVersion: "31.0.24027.1012",
        driverDate: "2026-02-21T00:00:00+08:00",
        discrete: false,
        status: "OK",
      },
    ],
    displays: [
      {
        name: "NE160QDM-NZ1",
        manufacturer: "BOE",
        resolution: "2560x1600",
        refreshHz: 165,
        sizeInch: 14,
        primary: true,
      },
    ],
    disks: [
      {
        model: "Samsung SSD 980 PRO 1TB",
        vendor: "Samsung",
        serial: "S6B0NL0T412345",
        firmware: "5B2QGXA7",
        interfaceType: "NVMe",
        mediaType: "SSD",
        totalBytes: 1000 * 1000 * 1000 * 1000,
        health: "healthy",
        healthPct: 97,
        temperatureC: null,
        powerOnHours: 4218,
        powerCycles: 1180,
        volumes: [
          { drive: "C:", label: "系统", fs: "NTFS", totalBytes: 476 * GB, freeBytes: 212 * GB },
          { drive: "D:", label: "资料", fs: "NTFS", totalBytes: 455 * GB, freeBytes: 268 * GB },
        ],
      },
    ],
    network: {
      adapters: [
        {
          name: "MediaTek Wi-Fi 6E MT7922 160MHz Wireless LAN Card",
          type: "WLAN",
          mac: "A0-36-BC-11-22-33",
          ipv4: "192.168.1.24",
          ipv6: "fe80::1c2d:3e4f:5566:7788",
          gateway: "192.168.1.1",
          dns: ["223.5.5.5", "119.29.29.29"],
          speedMbps: 1200,
          connected: true,
          ssid: "QINGWU-5G",
          signalPct: 87,
        },
      ],
      internet: true,
      latencyMs: 24,
      dnsOk: true,
    },
    runtime: {
      dotnetFramework: [
        { version: "4.8.1", release: 533320, installed: true },
        { version: "4.8", release: 528040, installed: true },
        { version: "3.5", release: 0, installed: false },
      ],
      dotnetRuntimes: [
        { name: "Microsoft.NETCore.App", version: "8.0.19" },
        { name: "Microsoft.NETCore.App", version: "10.0.10" },
        { name: "Microsoft.WindowsDesktop.App", version: "8.0.19" },
      ],
      vcpp: [
        { year: "2015-2022", arch: "x64", version: "14.44.35211" },
        { year: "2015-2022", arch: "x86", version: "14.44.35211" },
        { year: "2013", arch: "x64", version: "12.0.40664" },
      ],
      directx: {
        version: "12",
        major: 12,
        d3d12: true,
        wddm: "3.1",
        featureLevel: null,
      },
      webview2: { installed: true, version: "155.0.4283.62" },
      java: [
        { name: "OpenJDK 21", version: "21.0.4", path: "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4+7\\bin\\java.exe", source: "registry" },
      ],
      node: { name: "Node.js", version: "24.12.0", path: "D:\\nodejs\\node.exe", source: "path" },
      python: { name: "Python", version: "3.14.0", path: "D:\\Python314\\python.exe", source: "path" },
      git: { name: "Git", version: "2.51.0", path: "C:\\Program Files\\Git\\cmd\\git.exe", source: "path" },
      wsl: { installed: true, version: "2.6.1", distros: ["Ubuntu-22.04"] },
      powershellVersion: "5.1.26100.6584",
      software: [
        { name: "MySQL", version: "8.4.2", path: "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe", category: "database", source: "service", running: true, detail: "端口 3306" },
        { name: "Redis", version: "7.2.5", path: "D:\\Redis\\redis-server.exe", category: "database", source: "service", running: false, detail: "端口 6379" },
        { name: "SQLite", version: "3.45.1", path: "D:\\sqlite\\sqlite3.exe", category: "database", source: "path", running: null, detail: null },
        { name: "Docker Desktop", version: "27.3.1", path: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe", category: "container", source: "registry", running: true, detail: "引擎 27.3.1" },
        { name: "VirtualBox", version: "7.1.4", path: "C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe", category: "container", source: "registry", running: false, detail: null },
        { name: "nginx", version: "1.27.3", path: "D:\\nginx\\nginx.exe", category: "webServer", source: "dir", running: false, detail: "端口 80" },
        { name: "Go", version: "1.23.4", path: "C:\\Program Files\\Go\\bin\\go.exe", category: "language", source: "command", running: null, detail: null },
        { name: "Rust", version: "1.83.0", path: "C:\\Users\\qingwu\\.cargo\\bin\\rustc.exe", category: "language", source: "command", running: null, detail: null },
        { name: "PHP", version: "8.3.14", path: "D:\\php\\php.exe", category: "language", source: "path", running: null, detail: null },
        { name: "Visual Studio Code", version: "1.95.3", path: "C:\\Users\\qingwu\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", category: "devTool", source: "registry", running: false, detail: null },
        { name: "Visual Studio 2022", version: "17.12.3", path: "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community", category: "devTool", source: "registry", running: null, detail: "Community" },
        { name: "IntelliJ IDEA", version: "2024.3", path: "C:\\Program Files\\JetBrains\\IntelliJ IDEA 2024.3\\bin\\idea64.exe", category: "devTool", source: "registry", running: false, detail: null },
        { name: "Steam", version: "2.10.91.91", path: "C:\\Program Files (x86)\\Steam\\steam.exe", category: "common", source: "registry", running: true, detail: null },
        { name: "微信", version: "3.9.12", path: "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe", category: "common", source: "registry", running: false, detail: null },
      ],
    },
    security: {
      defenderRealtime: true,
      antivirus: ["Windows Defender"],
      firewall: "已开启（域/专用/公用）",
      secureBoot: true,
      tpm: "2.0",
      uac: "已开启",
    },
    compat: summarizeCompat(COMPAT_ITEMS),
    score: {
      total: 86,
      level: "good",
      parts: [
        { key: "cpu", label: "处理器", score: 92, weight: 0.25, note: "8 核 16 线程，Zen4 架构，性能充裕" },
        { key: "memory", label: "内存", score: 88, weight: 0.2, note: "32 GB LPDDR5-5600，双通道" },
        { key: "storage", label: "存储", score: 90, weight: 0.25, note: "NVMe SSD，健康度 97%，剩余 212 GB" },
        { key: "gpu", label: "显卡", score: 84, weight: 0.15, note: "RTX 4060 Laptop 8 GB" },
        { key: "system", label: "系统状态", score: 74, weight: 0.15, note: "已激活，Secure Boot 正常；系统盘建议留更多余量" },
      ],
    },
  };
}

let tick = 0;
export function mockLive(): LiveSnapshot {
  tick += 1;
  const wave = (a: number, b: number, p: number) => a + b * Math.abs(Math.sin(tick / p));
  const cores = 16;
  const perCore = Array.from({ length: cores }, (_, i) =>
    Math.round(wave(6 + (i % 4) * 3, 22, 3 + (i % 5)) * 10) / 10,
  );
  return {
    ts: Date.now(),
    cpuUsage: Math.round(wave(11, 26, 4.2) * 10) / 10,
    cpuPerCore: perCore,
    cpuFreqMhz: Math.round(wave(3900, 700, 5)),
    memUsedBytes: (13.8 + Math.sin(tick / 7) * 0.6) * GB,
    memTotalBytes: 32 * GB,
    swapUsedBytes: 1.2 * GB,
    swapTotalBytes: 8 * GB,
    netRxBps: Math.round(wave(180_000, 900_000, 2.5)),
    netTxBps: Math.round(wave(40_000, 220_000, 3.1)),
    diskReadBps: Math.round(wave(2_400_000, 18_000_000, 4.4)),
    diskWriteBps: Math.round(wave(900_000, 6_500_000, 3.7)),
    uptimeSec: 37482 + tick,
  };
}

export const mockAppInfo: AppInfo = {
  name: "爱弥斯 · 环境检测",
  version: "1.3.1",
  author: "清吾",
  homepage: "https://qingwu.ink",
  buildDate: new Date().toISOString(),
};
