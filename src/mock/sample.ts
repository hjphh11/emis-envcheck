/**
 * 浏览器预览用的假数据。
 * 只为了让 UI 脱离 Rust 也能开发/截图；桌面里永远走真实 scan_all。
 * 数值按「一台 2023 年的游戏本」编的，结构必须与 src/types.ts 完全一致。
 */
import type { AppInfo, LiveSnapshot, ScanResult } from "../types";

const GB = 1024 ** 3;

export function mockScan(): ScanResult {
  return {
    meta: {
      scanMs: 3120,
      generatedAt: new Date().toISOString(),
      isAdmin: false,
      elevationGains: ["CPU 温度 / 风扇转速", "硬盘 SMART 明细", "TPM 与 BitLocker 状态"],
      warnings: ["未以管理员运行：温度与 SMART 明细不可用"],
      collectorVersion: "1.0.0",
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
    },
    security: {
      defenderRealtime: true,
      antivirus: ["Windows Defender"],
      firewall: "已开启（域/专用/公用）",
      secureBoot: true,
      tpm: "2.0",
      uac: "已开启",
    },
    compat: {
      verdict: "ok",
      passCount: 9,
      warnCount: 1,
      failCount: 0,
      unknownCount: 0,
      items: [
        { id: "cpu64", name: "64 位处理器", status: "pass", actual: "x64", requirement: "需要 64 位处理器", reason: null, detail: "AMD Ryzen 9 7940HS" },
        { id: "cpuModel", name: "CPU 型号在支持列表", status: "pass", actual: "Ryzen 9 7940HS（Zen4）", requirement: "Intel 8 代及以上 / AMD Zen 2 及以上", reason: null, detail: null },
        { id: "cpuCore", name: "核心与频率", status: "pass", actual: "8 核 16 线程 / 4.0GHz", requirement: "≥ 2 核 且 ≥ 1.0GHz", reason: null, detail: null },
        { id: "ram", name: "内存容量", status: "pass", actual: "32 GB", requirement: "≥ 4 GB", reason: null, detail: null },
        { id: "disk", name: "系统盘可用空间", status: "pass", actual: "212 GB 可用", requirement: "≥ 64 GB", reason: null, detail: null },
        { id: "uefi", name: "UEFI 固件", status: "pass", actual: "UEFI", requirement: "需要 UEFI 引导", reason: null, detail: null },
        { id: "secureboot", name: "安全启动", status: "pass", actual: "已开启", requirement: "需要支持并开启安全启动", reason: null, detail: null },
        { id: "tpm", name: "TPM 2.0", status: "pass", actual: "2.0", requirement: "需要 TPM 2.0", reason: null, detail: null },
        { id: "dx12", name: "DirectX 12 / WDDM 2.0", status: "pass", actual: "DirectX 12 / WDDM 3.1", requirement: "需要 DirectX 12 与 WDDM 2.0 显卡驱动", reason: null, detail: null },
        { id: "display", name: "显示器规格", status: "pass", actual: "2560×1600 @165Hz", requirement: "≥ 9 英寸 / 720p", reason: null, detail: null },
        { id: "sse42", name: "SSE4.2 / POPCNT 指令集", status: "pass", actual: "支持", requirement: "需要支持 SSE4.2 与 POPCNT", reason: null, detail: "24H2 起新增要求" },
        { id: "driver", name: "显卡驱动签名", status: "warn", actual: "WDDM 3.1（2026-06 驱动）", requirement: "建议使用最新驱动", reason: "驱动已发布 4 个月，建议更新到最新版", detail: null },
      ],
    },
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
  version: "1.0.0",
  author: "清吾",
  homepage: "https://qingwu.ink",
  buildDate: new Date().toISOString(),
};
