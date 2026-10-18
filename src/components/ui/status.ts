import type { CheckStatus } from "../../types";

/** 状态文案（一致性：所有页面共用一份） */
export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "通过",
  warn: "注意",
  fail: "不通过",
  unknown: "未知",
};

/** 环境页的行状态文案（更贴近「装没装」的语义） */
export const ENV_STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "已安装",
  warn: "版本较旧",
  fail: "缺失",
  unknown: "未检测到",
};

export const COMPAT_STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "通过",
  warn: "需注意",
  fail: "不通过",
  unknown: "未知",
};

export const VERDICT_META = {
  ok: {
    eyebrow: "升级体检结论",
    title: "可以升级",
    sub: "关键要求均已满足，可以放心升级到目标系统。",
    tone: "ok" as const,
  },
  warn: {
    eyebrow: "升级体检结论",
    title: "有风险项",
    sub: "主要要求已满足，但存在需要注意的项目，建议先处理。",
    tone: "warn" as const,
  },
  blocked: {
    eyebrow: "升级体检结论",
    title: "不满足",
    sub: "存在硬性条件未满足，直接升级会失败或体验很差。",
    tone: "blocked" as const,
  },
};
