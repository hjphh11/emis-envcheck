import type { ReactNode } from "react";

export interface InfoRowProps {
  k: ReactNode;
  v: ReactNode;
  /** 值文字的语气 */
  tone?: "default" | "ok" | "warn" | "fail" | "accent";
  /** 用等宽字体（路径、序列号、MAC 之类） */
  mono?: boolean;
  /** 悬停提示（长路径省略时用） */
  title?: string;
}

/** 一行键值：左侧浅色标签、右侧正文值 */
export function InfoRow({ k, v, tone = "default", mono, title }: InfoRowProps) {
  return (
    <div className="info-row">
      <span className="info-row__k">{k}</span>
      <span
        className={[
          "info-row__v",
          mono ? "info-row__v--mono" : "",
          tone !== "default" ? `info-row__v--${tone}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={title}
      >
        {v}
      </span>
    </div>
  );
}

export interface InfoGridProps {
  children: ReactNode;
  /** 1 或 2 列（窄卡用 1 列） */
  cols?: 1 | 2;
}

export function InfoGrid({ children, cols = 1 }: InfoGridProps) {
  return (
    <div className={["info-grid", cols === 2 ? "info-grid--2" : ""].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
