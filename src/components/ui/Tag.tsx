import type { ReactNode } from "react";

export type TagTone = "rose" | "ok" | "warn" | "fail" | "muted" | "outline";

export interface TagProps {
  tone?: TagTone;
  children: ReactNode;
  title?: string;
  className?: string;
}

/** 小标签：版本号、24H2、独立显卡、激活类型等 */
export function Tag({ tone = "rose", children, title, className }: TagProps) {
  return (
    <span
      className={[`tag`, tone !== "rose" ? `tag--${tone}` : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      title={title}
    >
      {children}
    </span>
  );
}
