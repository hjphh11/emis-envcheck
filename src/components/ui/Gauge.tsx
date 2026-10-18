import { useEffect, useId, useState } from "react";
import { useCountUp } from "../../lib/hooks";
import { clampPct } from "../../lib/format";

export interface GaugeProps {
  /** 0–100 */
  value: number;
  /** 环内小字，默认「综合评分」 */
  unit?: string;
  /** 环的粗细（viewBox 单位） */
  thickness?: number;
}

/**
 * 0–100 评分环：SVG stroke-dasharray + 数字滚动。
 * 首次挂载时环从 0 长到目标值；降低动效时直接显示终值。
 */
export function Gauge({ value, unit = "综合评分", thickness = 13 }: GaugeProps) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `gauge-grad-${raw}`;
  const [ready, setReady] = useState(false);
  const target = clampPct(value);
  const shown = useCountUp(target);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = 84;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (ready ? target : 0) / 100);

  return (
    <div className="gauge">
      <svg
        className="gauge__svg"
        viewBox="0 0 200 200"
        role="img"
        aria-label={`综合评分 ${Math.round(target)} 分`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--color-rose)", stopOpacity: 1 }}
            />
            <stop
              offset="60%"
              style={{ stopColor: "var(--color-crimson)", stopOpacity: 1 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--color-amber)", stopOpacity: 1 }}
            />
          </linearGradient>
        </defs>
        {/* 轨道 */}
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          style={{
            stroke: "color-mix(in oklab, var(--color-crimson) 9%, transparent)",
          }}
          strokeWidth={thickness}
        />
        {/* 进度 */}
        <circle
          className="gauge__ring"
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="gauge__center">
        <div className="gauge__value">{Math.round(shown)}</div>
        <div className="gauge__unit">{unit}</div>
      </div>
    </div>
  );
}
