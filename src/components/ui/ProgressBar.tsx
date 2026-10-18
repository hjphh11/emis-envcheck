import { clampPct } from "../../lib/format";

export type BarSize = "sm" | "md" | "lg";
export type BarTone =
  | "default"
  | "ok"
  | "warn"
  | "fail"
  | "muted"
  | "high"
  | "good"
  | "mid"
  | "low";

export interface ProgressBarProps {
  /** 0–100；null 视为 0 */
  value: number | null | undefined;
  size?: BarSize;
  tone?: BarTone;
  label?: string;
  className?: string;
}

export function ProgressBar({
  value,
  size = "md",
  tone = "default",
  label,
  className,
}: ProgressBarProps) {
  const pct = clampPct(value);
  return (
    <span
      className={["bar", `bar--${size}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <span
        className={[
          "bar__fill",
          tone !== "default" ? `bar__fill--${tone}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
