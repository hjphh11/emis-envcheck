import { useId } from "react";
import { clampPct } from "../../lib/format";

export interface SparkSeries {
  data: number[];
  /** 任意 CSS 颜色（推荐用 var(--color-*)） */
  color: string;
  /** 是否画渐变填充 */
  area?: boolean;
}

export interface SparklineProps {
  series: SparkSeries[];
  /** 纵轴上限；不传则按数据自动取 */
  max?: number;
  className?: string;
  emptyText?: string;
  /** 是否画横向参考线 */
  grid?: boolean;
  /** 网格线的「数值」位置（会按当前纵轴换算），默认 25/50/75 */
  gridValues?: number[];
  /** 当前值的水平参考线（数值） */
  refValue?: number | null;
  /** 参考线右侧的小标签，如「当前 35.6%」 */
  refLabel?: string;
}

/**
 * 手写 SVG 折线：viewBox 100×100 + preserveAspectRatio="none" 自适应宽高，
 * 线宽用 vector-effect 保持 2px，不被拉伸。
 * 数据以「最新一个点贴右边」的方式对齐。
 */
export function Sparkline({
  series,
  max,
  className,
  emptyText = "等待采样…",
  grid = true,
  gridValues,
  refValue,
  refLabel,
}: SparklineProps) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = series.reduce((m, s) => Math.max(m, s.data.length), 0);
  const all = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  const autoTop = all.length ? Math.max(...all) : 1;
  const top = Math.max(1, max ?? autoTop * 1.18);
  const hasData = all.length > 0;

  /** 数值 → viewBox 里的 y（上下各留 4% 呼吸） */
  const yFor = (v: number) => 96 - clampPct((v / top) * 100) * 0.92;

  const build = (s: SparkSeries) => {
    const len = s.data.length;
    if (!len) return { line: "", area: "" };
    const offset = n - len;
    const pts = s.data.map((v, i) => {
      const x = n <= 1 ? 100 : ((offset + i) / (n - 1)) * 100;
      return `${x.toFixed(2)},${yFor(v).toFixed(2)}`;
    });
    const firstX = n <= 1 ? 100 : ((offset + 0) / (n - 1)) * 100;
    const lastX = n <= 1 ? 100 : ((offset + len - 1) / (n - 1)) * 100;
    return {
      line: pts.join(" "),
      area: `M ${firstX.toFixed(2)},100 L ${pts.join(" L ")} L ${lastX.toFixed(
        2,
      )},100 Z`,
    };
  };

  const gridLines =
    gridValues ?? [0.25, 0.5, 0.75].map((p) => top * p);
  const hasRef = refValue != null && Number.isFinite(refValue);
  const refY = hasRef ? yFor(refValue as number) : null;

  return (
    <div className={["spark", className ?? ""].filter(Boolean).join(" ")}>
      <svg className="spark__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          {series.map((s, i) => (
            <linearGradient
              key={i}
              id={`spark-fill-${raw}-${i}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                style={{ stopColor: s.color, stopOpacity: 0.3 }}
              />
              <stop
                offset="100%"
                style={{ stopColor: s.color, stopOpacity: 0.02 }}
              />
            </linearGradient>
          ))}
        </defs>
        {grid &&
          gridLines.map((v) => (
            <line
              key={v}
              className="spark__grid-line"
              x1="0"
              y1={yFor(v)}
              x2="100"
              y2={yFor(v)}
            />
          ))}
        {series.map((s, i) => {
          const { line, area } = build(s);
          if (!line) return null;
          return (
            <g key={i}>
              {s.area && (
                <path d={area} fill={`url(#spark-fill-${raw}-${i})`} stroke="none" />
              )}
              <polyline className="spark__line" points={line} style={{ stroke: s.color }} />
            </g>
          );
        })}
        {refY != null && (
          <line
            className="spark__ref-line"
            x1="0"
            y1={refY}
            x2="100"
            y2={refY}
          />
        )}
      </svg>
      {hasRef && refLabel && (
        <span className="spark__ref-tag" style={{ top: `${refY}%` }}>
          {refLabel}
        </span>
      )}
      {!hasData && <span className="spark__empty">{emptyText}</span>}
    </div>
  );
}
