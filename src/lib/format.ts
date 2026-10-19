/**
 * 展示层格式化工具。
 * 原则：拿不到的字段一律显示「未知」，绝不把 null / undefined / NaN 漏到界面上。
 */
import type { CheckStatus, DiskHealth, SoftwareCategory } from "../types";

/** 字符串兜底 */
export function text(v: string | null | undefined, fallback = "未知"): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
}

/** 数字兜底 */
export function num(
  v: number | null | undefined,
  fallback = "未知",
  digits = 0,
): string {
  if (v == null || !Number.isFinite(v)) return fallback;
  return trimZeros(v.toFixed(digits));
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** 字节 → 人类可读（1024 进制） */
export function fmtBytes(
  bytes: number | null | undefined,
  fallback = "未知",
): string {
  if (bytes == null || !Number.isFinite(bytes)) return fallback;
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${trimZeros(v.toFixed(digits))} ${BYTE_UNITS[i]}`;
}

/** 速率（bytes/s）→ 人类可读 */
export function fmtSpeed(
  bps: number | null | undefined,
  fallback = "未知",
): string {
  if (bps == null || !Number.isFinite(bps)) return fallback;
  let v = Math.max(0, bps);
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${trimZeros(v.toFixed(digits))} ${BYTE_UNITS[i]}/s`;
}

/** 秒 → 「3 天 4 小时」/「10 小时 24 分」/「12 分 30 秒」 */
export function fmtUptime(
  sec: number | null | undefined,
  fallback = "未知",
): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return fallback;
  const total = Math.floor(sec);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${mins} 分`;
  if (mins > 0) return `${mins} 分 ${secs} 秒`;
  return `${secs} 秒`;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 时间 → 2025-03-14 */
export function fmtDate(
  iso: string | null | undefined,
  fallback = "未知",
): string {
  const d = parseDate(iso);
  if (!d) return fallback;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO 时间 → 2025-03-14 10:22 */
export function fmtDateTime(
  iso: string | null | undefined,
  fallback = "未知",
): string {
  const d = parseDate(iso);
  if (!d) return fallback;
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 毫秒时间戳 → 19:30:05 */
export function fmtClock(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "未知";
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 百分比 */
export function fmtPct(
  v: number | null | undefined,
  digits = 0,
  fallback = "未知",
): string {
  if (v == null || !Number.isFinite(v)) return fallback;
  return `${trimZeros(v.toFixed(digits))}%`;
}

/** 频率 MHz → 4.18 GHz / 900 MHz */
export function fmtMhz(
  mhz: number | null | undefined,
  fallback = "未知",
): string {
  if (mhz == null || !Number.isFinite(mhz) || mhz <= 0) return fallback;
  if (mhz >= 1000) return `${trimZeros((mhz / 1000).toFixed(2))} GHz`;
  return `${Math.round(mhz)} MHz`;
}

/** 核心数文案 */
export function fmtCores(
  physical: number | null | undefined,
  logical: number | null | undefined,
): string {
  if (physical == null && logical == null) return "未知";
  if (physical != null && logical != null) {
    return `${physical} 核 ${logical} 线程`;
  }
  if (logical != null) return `${logical} 线程`;
  return `${physical} 核`;
}

/** 数值裁剪到 0–100 */
export function clampPct(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export type LevelTone = "ok" | "warn" | "fail" | "plain";

export interface LevelInfo {
  /** 优秀 / 良好 / 一般 / 较差 */
  label: string;
  tone: LevelTone;
  /** 一句手写体批注 */
  hand: string;
}

/** 评分 → 等级文案（阈值按需求：≥90 优秀 / 80–89 良好 / 60–79 一般 / <60 较差） */
export function levelInfo(total: number | null | undefined): LevelInfo {
  /* 拿不到总分时不能按 0 分算成「较差」——那是把「没采到」说成「机器差」 */
  if (total == null || !Number.isFinite(total)) {
    return { label: "未知", tone: "plain", hand: "" };
  }
  const v = total;
  if (v >= 90) return { label: "优秀", tone: "ok", hand: "这台机器状态很精神～" };
  if (v >= 80) return { label: "良好", tone: "ok", hand: "整体状态不错～" };
  if (v >= 60) return { label: "一般", tone: "warn", hand: "有些地方可以再收拾一下" };
  return { label: "较差", tone: "fail", hand: "建议先处理一下短板" };
}

/* ============================================================
 * 枚举归一化 / 中文映射（界面与导出报告共用一份，避免两处不一致）
 * 采集器是老 PowerShell 脚本，枚举值可能拼错或缺失，一律先归一化再展示。
 * ============================================================ */

/** 非法 / 缺失的检测结论一律归到 unknown，绝不把 undefined 漏到界面上 */
export function normalizeCheckStatus(v: unknown): CheckStatus {
  return v === "pass" || v === "warn" || v === "fail" || v === "unknown"
    ? v
    : "unknown";
}

/** 非法 / 缺失的升级结论一律归到 warn（比误报「可以升级」安全） */
export function normalizeVerdict(v: unknown): "ok" | "warn" | "blocked" {
  return v === "ok" || v === "warn" || v === "blocked" ? v : "warn";
}

export interface DiskHealthInfo {
  text: string;
  tone: "ok" | "warn" | "fail" | "muted";
}

/** 磁盘健康枚举 → 中文与语气（报告里曾直接打印 healthy 这种英文枚举） */
export function diskHealthInfo(
  health: DiskHealth | string | null | undefined,
): DiskHealthInfo {
  switch (health) {
    case "healthy":
      return { text: "健康", tone: "ok" };
    case "warning":
      return { text: "有警告", tone: "warn" };
    case "critical":
      return { text: "异常", tone: "fail" };
    default:
      return { text: "未知", tone: "muted" };
  }
}

/** 已安装软件的分类顺序与中文名（环境页与报告共用） */
export const SOFTWARE_CATEGORY_ORDER: SoftwareCategory[] = [
  "database",
  "container",
  "webServer",
  "language",
  "devTool",
  "common",
];

export const SOFTWARE_CATEGORY_LABEL: Record<SoftwareCategory, string> = {
  database: "数据库",
  container: "容器与虚拟化",
  webServer: "Web 服务",
  language: "开发语言",
  devTool: "开发工具",
  common: "常用软件",
};

/** 未知分类（采集器将来加新枚举时的兜底展示名） */
export const SOFTWARE_CATEGORY_FALLBACK = "其他";

/** 软件分类 → 中文名，非法值兜底「其他」 */
export function softwareCategoryLabel(v: unknown): string {
  return (
    SOFTWARE_CATEGORY_LABEL[v as SoftwareCategory] ?? SOFTWARE_CATEGORY_FALLBACK
  );
}

/** 五维子分的暖色分段：≥90 高 / 75–89 良好 / 60–74 中性 / <60 低 */
export type ScoreBand = "high" | "good" | "mid" | "low";

export function scoreBand(score: number | null | undefined): ScoreBand {
  const v = score ?? 0;
  if (v >= 90) return "high";
  if (v >= 75) return "good";
  if (v >= 60) return "mid";
  return "low";
}
