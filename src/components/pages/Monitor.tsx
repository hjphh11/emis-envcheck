import { useEffect, useRef, useState } from "react";
import { Activity, Cpu, HardDrive, MemoryStick, Network } from "lucide-react";
import type { LiveSnapshot } from "../../types";
import { liveSnapshot } from "../../lib/api";
import {
  clampPct,
  fmtBytes,
  fmtClock,
  fmtMhz,
  fmtPct,
  fmtSpeed,
  fmtUptime,
} from "../../lib/format";
import { GlassCard } from "../ui/GlassCard";
import { ProgressBar } from "../ui/ProgressBar";
import { Sparkline } from "../ui/Sparkline";
import { StatusDot } from "../ui/StatusDot";
import { Tag } from "../ui/Tag";

/** 保留最近 60 个点（约 1 分钟） */
const MAX_POINTS = 60;

export function Monitor({ baseIndex = 0 }: { baseIndex?: number }) {
  const [history, setHistory] = useState<LiveSnapshot[]>([]);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  /* 页面隐藏时暂停轮询；切回前台立即补一个样本 */
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    let timer: number | undefined;

    const sample = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const snap = await liveSnapshot();
        if (cancelled) return;
        setHistory((prev) => {
          const next = [...prev, snap];
          return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlight.current = false;
      }
    };

    void sample();
    timer = window.setInterval(() => void sample(), 1000);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [hidden]);

  /* 离开页签时组件卸载 → 上面的 cleanup 会清掉定时器，不会泄漏 */

  const latest = history.length ? history[history.length - 1] : null;
  const cpuSeries = history.map((s) => s.cpuUsage);
  const rxSeries = history.map((s) => s.netRxBps);
  const txSeries = history.map((s) => s.netTxBps);
  const readSeries = history.map((s) => s.diskReadBps ?? 0);
  const writeSeries = history.map((s) => s.diskWriteBps ?? 0);
  const cores = latest?.cpuPerCore ?? [];
  const memPct =
    latest && latest.memTotalBytes > 0
      ? (latest.memUsedBytes / latest.memTotalBytes) * 100
      : null;
  const memFree =
    latest && latest.memTotalBytes > 0
      ? latest.memTotalBytes - latest.memUsedBytes
      : null;
  const showDisk = latest?.diskReadBps != null;

  return (
    <div>
      <div className="mon-topline">
        <span className="mon-live">
          <StatusDot status={hidden ? "unknown" : "pass"} pulse={!hidden} />
          {hidden ? "已暂停（页面不可见）" : "实时采集中"}
        </span>
        <span>每秒采样一次 · 保留最近 {MAX_POINTS} 个点</span>
        {latest && <span>最后更新 {fmtClock(latest.ts)}</span>}
        {error && (
          <Tag tone="fail" title={error}>
            采样失败
          </Tag>
        )}
      </div>

      <div className="mon-grid">
        {/* CPU 总占用 */}
        <GlassCard
          index={baseIndex}
          className="mon-span-2"
          title="处理器占用"
          icon={Cpu}
          extra={<span className="tiny">最近 60 秒</span>}
        >
          <div className="metric-hero">
            <span className="metric-hero__value">
              {fmtPct(latest?.cpuUsage, 1, "--")}
            </span>
            <span className="metric-hero__unit">CPU</span>
            <div className="metric-hero__aside">
              当前频率 {fmtMhz(latest?.cpuFreqMhz, "--")}
              <br />
              已运行 {fmtUptime(latest?.uptimeSec, "--")}
            </div>
          </div>
          <Sparkline
            className="mon-chart mon-chart--lg"
            max={100}
            gridValues={[25, 50, 75]}
            refValue={latest?.cpuUsage ?? null}
            refLabel={latest ? `当前 ${fmtPct(latest.cpuUsage, 1)}` : undefined}
            emptyText="正在采样…"
            series={[
              { data: cpuSeries, color: "var(--color-crimson)", area: true },
            ]}
          />
        </GlassCard>

        {/* 内存 */}
        <GlassCard
          index={baseIndex + 1}
          title="内存"
          icon={MemoryStick}
          extra={<span className="tiny">{history.length} 个样本</span>}
        >
          <div className="metric-hero">
            <span className="metric-hero__value">
              {fmtPct(memPct, 1, "--")}
            </span>
            <span className="metric-hero__unit">已用</span>
            <div className="metric-hero__aside">
              {fmtBytes(latest?.memUsedBytes, "--")} /{" "}
              {fmtBytes(latest?.memTotalBytes, "--")}
              <br />
              可用 {fmtBytes(memFree, "--")}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <ProgressBar
              value={memPct}
              size="lg"
              tone={memPct != null && memPct >= 90 ? "fail" : memPct != null && memPct >= 75 ? "warn" : "default"}
              label="内存使用率"
            />
          </div>
          <div className="mem-meta">
            <span>
              交换 {fmtBytes(latest?.swapUsedBytes, "--")} /{" "}
              {fmtBytes(latest?.swapTotalBytes, "--")}
            </span>
            <span>总内存 {fmtBytes(latest?.memTotalBytes, "--")}</span>
          </div>
        </GlassCard>

        {/* 网络 */}
        <GlassCard index={baseIndex + 2} title="网络" icon={Network}>
          <div className="metric-hero">
            <span
              className="metric-hero__value"
              style={{ fontSize: 30, letterSpacing: 0 }}
            >
              {fmtSpeed(latest?.netRxBps, "--")}
            </span>
            <span className="metric-hero__unit">下行</span>
            <div className="metric-hero__aside">
              上行 {fmtSpeed(latest?.netTxBps, "--")}
              <br />
              {latest ? fmtClock(latest.ts) : "等待采样"}
            </div>
          </div>
          <Sparkline
            className="mon-chart mon-chart--md"
            emptyText="正在采样…"
            series={[
              { data: rxSeries, color: "var(--color-crimson)", area: true },
              { data: txSeries, color: "var(--color-amber)" },
            ]}
          />
          <div className="spark-legend">
            <span
              className="spark-legend__item"
              style={{ color: "var(--color-crimson)" }}
            >
              <span className="spark-legend__swatch" />
              下行 {fmtSpeed(latest?.netRxBps, "--")}
            </span>
            <span
              className="spark-legend__item"
              style={{ color: "var(--color-warn-text)" }}
            >
              <span
                className="spark-legend__swatch"
                style={{ background: "var(--color-amber)" }}
              />
              上行 {fmtSpeed(latest?.netTxBps, "--")}
            </span>
          </div>
        </GlassCard>

        {/* 每核占用 */}
        <GlassCard
          index={baseIndex + 3}
          className="mon-span-2"
          title="每核占用"
          icon={Activity}
          extra={<span className="tiny">{cores.length} 个逻辑核心</span>}
        >
          {cores.length === 0 ? (
            <p className="tiny" style={{ padding: "4px 0" }}>
              正在采样…
            </p>
          ) : (
            <div className="core-grid">
              {cores.map((v, i) => {
                const pct = clampPct(v);
                const tone = pct >= 90 ? "hot" : pct >= 65 ? "warn" : "";
                return (
                  <div
                    className="core"
                    key={i}
                    title={`核心 ${i + 1} · ${Math.round(pct)}%`}
                  >
                    <span className="core__index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="core__track">
                      <span
                        className={["core__fill", tone ? `core__fill--${tone}` : ""]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ width: `${Math.max(pct, 1.5)}%` }}
                      />
                    </span>
                    <span className="core__value">{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* 磁盘读写：拿不到速率时整块隐藏 */}
        {showDisk && (
          <GlassCard
            index={baseIndex + 4}
            className="mon-span-2"
            title="磁盘读写"
            icon={HardDrive}
            extra={
              <span className="tiny">
                读 {fmtSpeed(latest?.diskReadBps, "--")} · 写{" "}
                {fmtSpeed(latest?.diskWriteBps, "--")}
              </span>
            }
          >
            <Sparkline
              className="mon-chart mon-chart--md"
              emptyText="正在采样…"
              series={[
                {
                  data: readSeries,
                  color: "var(--color-crimson)",
                  area: true,
                },
                { data: writeSeries, color: "var(--color-amber)" },
              ]}
            />
            <div className="spark-legend">
              <span
                className="spark-legend__item"
                style={{ color: "var(--color-crimson)" }}
              >
                <span className="spark-legend__swatch" />
                读取
              </span>
              <span
                className="spark-legend__item"
                style={{ color: "var(--color-warn-text)" }}
              >
                <span
                  className="spark-legend__swatch"
                  style={{ background: "var(--color-amber)" }}
                />
                写入
              </span>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
