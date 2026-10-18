import { useState } from "react";
import {
  Check,
  Copy,
  Cpu,
  Gauge as GaugeIcon,
  HardDrive,
  MemoryStick,
  Monitor,
  Network,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { ScanResult } from "../../types";
import { copyText } from "../../lib/api";
import {
  fmtBytes,
  fmtCores,
  fmtDate,
  fmtDateTime,
  fmtMhz,
  fmtPct,
  fmtUptime,
  levelInfo,
  scoreBand,
  text,
} from "../../lib/format";
import { GlassCard } from "../ui/GlassCard";
import { Gauge } from "../ui/Gauge";
import { portraitUrl } from "../ui/emis";
import { InfoGrid, InfoRow } from "../ui/InfoRow";
import { ProgressBar } from "../ui/ProgressBar";
import { StatusDot } from "../ui/StatusDot";
import { Tag } from "../ui/Tag";
import { Button } from "../ui/Button";

export interface DashboardProps {
  scan: ScanResult;
  notify: (message: string, tone?: "ok" | "err") => void;
}

function Empty({ children }: { children: string }) {
  return (
    <p className="tiny" style={{ padding: "6px 0" }}>
      {children}
    </p>
  );
}

/** 把关键配置拼成一行紧凑文本 */
export function buildConfigCode(scan: ScanResult): string {
  const { cpu, memory, gpus, motherboard, system } = scan;
  const gpu =
    gpus.find((g) => g.discrete) ??
    gpus[0];
  const module = memory.modules[0];
  const memType = module?.type ?? "";
  const memSpeed = module?.speedMhz ? `-${module.speedMhz}` : "";
  const mem = `${fmtBytes(memory.totalBytes).replace(/\s+/g, "")}${
    memType ? ` ${memType}${memSpeed}` : ""
  }`;
  const gpuText = gpu
    ? `${gpu.name.replace(/^NVIDIA\s+|^AMD\s+/i, "")}${
        gpu.vramBytes ? ` ${fmtBytes(gpu.vramBytes).replace(/\s+/g, "")}` : ""
      }`
    : "显卡未知";
  const board = motherboard.model ?? motherboard.vendor ?? "主板未知";
  const os = `${system.caption}${system.displayVersion ? ` ${system.displayVersion}` : ""}${
    system.build ? `·${system.build}` : ""
  }`;
  return [cpu.brand, mem, gpuText, board, os].join(" / ");
}

/** 浏览器预览里 navigator.clipboard 可能被权限策略拦掉，这里用旧接口兜底一次 */
function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function Dashboard({ scan, notify }: DashboardProps) {
  const { score, system, cpu, memory, gpus, displays, disks, network } = scan;
  const level = levelInfo(score.total);
  const [copied, setCopied] = useState(false);
  const configCode = buildConfigCode(scan);
  const parts = score.parts ?? [];

  const copyConfig = async () => {
    let ok = false;
    try {
      await copyText(configCode);
      ok = true;
    } catch {
      ok = legacyCopy(configCode);
    }
    if (!ok) {
      notify("复制失败，可以手动选中文本复制", "err");
      return;
    }
    setCopied(true);
    notify("配置码已复制到剪贴板");
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div>
      {/* 评分 + 五维子分 */}
      <div className="score-row">
        <GlassCard index={0} className="score-card">
          <div className="score-card__gauge">
            <Gauge value={score.total} unit="综合评分" />
          </div>
          <div className="score-card__level">
            <StatusDot
              status={
                level.tone === "ok"
                  ? "pass"
                  : level.tone === "warn"
                    ? "warn"
                    : level.tone === "fail"
                      ? "fail"
                      : "unknown"
              }
            />
            <span className="score-card__level-text">{level.label}</span>
          </div>
          <p className="score-card__hand">{level.hand}</p>
          <div className="score-card__foot">
            <div className="score-card__meta">
              采集耗时 {(scan.meta.scanMs / 1000).toFixed(1)} 秒 ·{" "}
              {fmtDateTime(scan.meta.generatedAt)}
              <br />
              {scan.meta.isAdmin ? "管理员权限 · 明细完整" : "普通权限 · 部分明细不可用"}
            </div>
            <img
              className="score-card__portrait"
              src={portraitUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </div>
        </GlassCard>

        <GlassCard
          index={1}
          title="五维子分"
          icon={GaugeIcon}
          extra={<span className="tiny">按权重加权</span>}
        >
          {parts.length === 0 ? (
            <Empty>评分明细未检测到。</Empty>
          ) : (
            <div className="dims">
              {parts.map((p) => {
                const band = scoreBand(p.score);
                return (
                  <div className="dim" key={p.key}>
                    <div className="dim__head">
                      <span className="dim__label">{p.label}</span>
                      <span className="dim__weight">
                        权重 {Math.round((p.weight ?? 0) * 100)}%
                      </span>
                      <span className={`dim__score dim__score--${band}`}>
                        {p.score}
                      </span>
                    </div>
                    <ProgressBar
                      value={p.score}
                      tone={band}
                      className="dim__track"
                      label={`${p.label} ${p.score} 分`}
                    />
                    <p className="dim__note">{text(p.note, "暂无依据说明")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* 六张基础信息卡 */}
      <div className="cards-grid">
        <GlassCard index={2} title="系统" icon={Monitor}>
          <InfoGrid>
            <InfoRow
              k="操作系统"
              v={
                <span>
                  {text(system.caption)}
                  {system.displayVersion && (
                    <Tag className="tag--outline" tone="outline">
                      {system.displayVersion}
                    </Tag>
                  )}
                </span>
              }
            />
            <InfoRow
              k="版本"
              v={`${text(system.version)}${system.ubr ? ` · UBR ${system.ubr}` : ""}`}
              mono
            />
            <InfoRow
              k="激活"
              v={
                <span>
                  {text(system.activation)}
                  {system.activationType ? `（${system.activationType}）` : ""}
                </span>
              }
              tone={system.activation === "已激活" ? "ok" : "default"}
            />
            <InfoRow k="运行时长" v={fmtUptime(system.uptimeSec)} />
            <InfoRow
              k="分辨率"
              v={
                system.resolution
                  ? `${system.resolution}${system.refreshHz ? ` @ ${system.refreshHz}Hz` : ""}`
                  : "未知"
              }
            />
            <InfoRow
              k="计算机名"
              v={`${text(system.hostname)} · ${text(system.username)}`}
              mono
            />
            <InfoRow k="电源计划" v={text(system.powerPlan)} />
            <InfoRow k="安装日期" v={fmtDate(system.installDate)} />
          </InfoGrid>
        </GlassCard>

        <GlassCard index={3} title="处理器" icon={Cpu}>
          <InfoGrid>
            <InfoRow k="型号" v={text(cpu.brand)} />
            <InfoRow
              k="核心"
              v={
                <span>
                  {fmtCores(cpu.physicalCores, cpu.logicalCores)}
                  {cpu.arch && (
                    <Tag tone="muted" className="nowrap">
                      {cpu.arch}
                    </Tag>
                  )}
                </span>
              }
            />
            <InfoRow
              k="频率"
              v={`${fmtMhz(cpu.baseMhz)} → ${fmtMhz(cpu.maxMhz)}`}
              mono
            />
            <InfoRow k="当前频率" v={fmtMhz(cpu.currentMhz)} mono />
            <InfoRow
              k="缓存"
              v={`L2 ${fmtBytes(cpu.l2Bytes)} · L3 ${fmtBytes(cpu.l3Bytes)}`}
              mono
            />
            <InfoRow
              k="插槽"
              v={`${text(cpu.socket)} · ${cpu.virtualization == null ? "虚拟化未知" : cpu.virtualization ? "虚拟化已开启" : "虚拟化未开启"}`}
            />
          </InfoGrid>
          {cpu.instructions.length > 0 && (
            <div className="inline-tags">
              {cpu.instructions.map((i) => (
                <Tag key={i} tone="outline">
                  {i}
                </Tag>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard index={4} title="内存" icon={MemoryStick}>
          <div className="mem-top">
            <span className="mem-top__used">{fmtBytes(memory.usedBytes)}</span>
            <span className="mem-top__total">/ {fmtBytes(memory.totalBytes)}</span>
            <span className="mem-top__pct">已用 {fmtPct(memory.usedPct, 1)}</span>
          </div>
          <ProgressBar
            value={memory.usedPct}
            tone={
              memory.usedPct >= 90 ? "fail" : memory.usedPct >= 75 ? "warn" : "default"
            }
            size="lg"
            label="内存使用率"
          />
          <div className="mem-stats">
            <div className="mem-stat">
              <span className="mem-stat__k">总容量</span>
              <span className="mem-stat__v">{fmtBytes(memory.totalBytes)}</span>
            </div>
            <div className="mem-stat">
              <span className="mem-stat__k">可用</span>
              <span className="mem-stat__v">{fmtBytes(memory.availableBytes)}</span>
            </div>
            <div className="mem-stat">
              <span className="mem-stat__k">通道</span>
              <span className="mem-stat__v">
                {memory.dualChannelHint == null
                  ? "未知"
                  : memory.dualChannelHint
                    ? "双通道"
                    : "单通道"}
              </span>
            </div>
          </div>
          {memory.modules.length === 0 ? (
            <Empty>未检测到内存条明细。</Empty>
          ) : (
            memory.modules.map((m, i) => (
              <div className="module" key={`${m.slot ?? "slot"}-${i}`}>
                <span className="module__name" title={m.partNumber ?? undefined}>
                  {text(m.slot, `内存条 ${i + 1}`)} · {text(m.partNumber, "型号未知")}
                </span>
                <span className="module__size">{fmtBytes(m.capacityBytes)}</span>
                <span className="module__meta">
                  {[
                    m.type,
                    m.speedMhz ? `${m.speedMhz} MHz` : m.ratedMhz ? `${m.ratedMhz} MHz` : null,
                    m.manufacturer,
                    m.formFactor,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "规格未知"}
                </span>
              </div>
            ))
          )}
        </GlassCard>

        <GlassCard
          index={5}
          title="显卡"
          icon={Monitor}
          extra={<Tag tone="muted">{gpus.length} 个适配器</Tag>}
        >
          {gpus.length === 0 ? (
            <Empty>未检测到显卡。</Empty>
          ) : (
            gpus.map((g, i) => (
              <div className="adapter" key={`${g.name}-${i}`}>
                <div className="adapter__top">
                  <span className="adapter__name" title={g.name}>
                    {text(g.name)}
                  </span>
                </div>
                <div className="adapter__tags">
                  <Tag>{fmtBytes(g.vramBytes)} 显存</Tag>
                  <Tag tone="muted">
                    {g.discrete == null ? "类型未知" : g.discrete ? "独立显卡" : "集成显卡"}
                  </Tag>
                  {g.status && <Tag tone="outline">{g.status}</Tag>}
                </div>
                <div style={{ marginTop: 6 }}>
                  <InfoGrid>
                    <InfoRow k="驱动版本" v={text(g.driverVersion)} mono />
                    <InfoRow k="驱动日期" v={fmtDate(g.driverDate)} />
                  </InfoGrid>
                </div>
              </div>
            ))
          )}
          {displays.length > 0 && (
            <div className="display-block">
              <div className="display-block__head">显示器</div>
              {displays.map((d, i) => (
                <div className="display-row" key={`${d.name ?? "display"}-${i}`}>
                  <span className="display-row__name" title={d.name ?? undefined}>
                    {text(d.name, `显示器 ${i + 1}`)}
                  </span>
                  <span className="display-row__meta">
                    {[
                      d.resolution,
                      d.refreshHz ? `${d.refreshHz}Hz` : null,
                      d.sizeInch ? `${d.sizeInch}″` : null,
                      d.primary ? "主屏" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard index={6} title="硬盘" icon={HardDrive}>
          {disks.length === 0 ? (
            <Empty>未检测到硬盘。</Empty>
          ) : (
            disks.map((d, i) => {
              const healthTone =
                d.health === "healthy"
                  ? "ok"
                  : d.health === "warning"
                    ? "warn"
                    : d.health === "critical"
                      ? "fail"
                      : "muted";
              const healthText =
                d.health === "healthy"
                  ? "健康"
                  : d.health === "warning"
                    ? "有警告"
                    : d.health === "critical"
                      ? "异常"
                      : "未知";
              return (
                <div className="disk-block" key={`${d.model}-${i}`}>
                  <div className="disk-top">
                    <span className="disk-model" title={d.model}>
                      {text(d.model)}
                    </span>
                    <Tag tone={healthTone === "muted" ? "muted" : healthTone}>
                      {healthText}
                      {d.healthPct != null ? ` ${d.healthPct}%` : ""}
                    </Tag>
                  </div>
                  <div className="disk-meta">
                    <span>{text(d.interfaceType)}</span>
                    <span>{text(d.mediaType)}</span>
                    <span>{fmtBytes(d.totalBytes)}</span>
                    <span>
                      温度 {d.temperatureC != null ? `${d.temperatureC} ℃` : "未知"}
                    </span>
                    <span>
                      通电
                      {d.powerOnHours != null
                        ? ` ${d.powerOnHours.toLocaleString("zh-CN")} 小时`
                        : " 未知"}
                    </span>
                  </div>
                  {d.healthPct != null && (
                    <div style={{ marginTop: 7 }}>
                      <ProgressBar
                        value={d.healthPct}
                        size="sm"
                        tone={
                          d.healthPct >= 80
                            ? "ok"
                            : d.healthPct >= 50
                              ? "warn"
                              : "fail"
                        }
                        label="硬盘健康度"
                      />
                    </div>
                  )}
                  {(d.volumes ?? []).map((v) => {
                    const usedPct =
                      v.totalBytes > 0
                        ? ((v.totalBytes - v.freeBytes) / v.totalBytes) * 100
                        : 0;
                    return (
                      <div className="volume" key={v.drive}>
                        <div className="volume__head">
                          <span className="volume__drive">
                            {text(v.drive)} {v.label ? `· ${v.label}` : ""}
                          </span>
                          <span>
                            已用 {fmtBytes(v.totalBytes - v.freeBytes)} /{" "}
                            {fmtBytes(v.totalBytes)}
                          </span>
                          <span className="volume__free">
                            剩余 {fmtBytes(v.freeBytes)}
                          </span>
                        </div>
                        <ProgressBar
                          value={usedPct}
                          size="sm"
                          tone={usedPct >= 90 ? "fail" : usedPct >= 75 ? "warn" : "default"}
                          label={`${v.drive} 使用率`}
                        />
                      </div>
                    );
                  })}
                  {d.volumes.length === 0 && <Empty>该磁盘没有可用分区信息。</Empty>}
                </div>
              );
            })
          )}
        </GlassCard>

        <GlassCard index={7} title="网络" icon={Network}>
          <div className="net-status">
            <span className="net-status__item">
              <StatusDot
                status={
                  network.internet == null
                    ? "unknown"
                    : network.internet
                      ? "pass"
                      : "warn"
                }
              />
              {network.internet == null
                ? "联网未知"
                : network.internet
                  ? "已联网"
                  : "未联网"}
            </span>
            <span className="net-status__item">
              延迟 {network.latencyMs != null ? `${network.latencyMs} ms` : "未知"}
            </span>
            <span className="net-status__item">
              DNS {network.dnsOk == null ? "未知" : network.dnsOk ? "正常" : "异常"}
            </span>
          </div>
          {(network.adapters ?? []).length === 0 ? (
            <Empty>未检测到网络适配器。</Empty>
          ) : (
            network.adapters.map((a, i) => (
              <div className="adapter" key={`${a.name}-${i}`}>
                <div className="adapter__top">
                  <span className="adapter__name" title={a.name}>
                    {text(a.name)}
                  </span>
                  <StatusDot status={a.connected ? "pass" : "unknown"} />
                </div>
                <div className="adapter__tags">
                  <Tag>{text(a.type)}</Tag>
                  {a.ssid && <Tag tone="muted">{a.ssid}</Tag>}
                  {a.signalPct != null && (
                    <Tag tone="outline">信号 {Math.round(a.signalPct)}%</Tag>
                  )}
                  {a.speedMbps != null && (
                    <Tag tone="outline">{a.speedMbps} Mbps</Tag>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  {a.connected ? (
                    <InfoGrid>
                      <InfoRow k="IPv4" v={text(a.ipv4)} mono />
                      <InfoRow k="网关" v={text(a.gateway)} mono />
                      <InfoRow
                        k="DNS"
                        v={a.dns.length ? a.dns.join(" / ") : "未知"}
                        mono
                        title={a.dns.join(" / ")}
                      />
                      <InfoRow k="MAC" v={text(a.mac)} mono />
                    </InfoGrid>
                  ) : (
                    /* 未连接的适配器不铺一堆「未知」，只留标识信息 */
                    <InfoGrid>
                      <InfoRow k="MAC" v={text(a.mac)} mono />
                      <InfoRow k="状态" v="未连接 · 无 IP 信息" tone="warn" />
                    </InfoGrid>
                  )}
                </div>
              </div>
            ))
          )}
        </GlassCard>
      </div>

      {/* 配置码 */}
      <GlassCard index={8} title="配置码" icon={Terminal} className="config-card">
        <div className="config-line">
          <div
            className="config-code"
            title={`${configCode}\n\n聚焦后按 Ctrl+C 可复制`}
            tabIndex={0}
            role="textbox"
            aria-readonly="true"
            aria-label="配置码，聚焦后按 Ctrl+C 复制"
            onKeyDown={(e) => {
              const noSelection = !window.getSelection()?.toString();
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && noSelection) {
                e.preventDefault();
                void copyConfig();
              }
            }}
          >
            {configCode}
          </div>
          <Button
            variant="ghost"
            icon={copied ? Check : Copy}
            onClick={() => void copyConfig()}
            title="复制这一行配置信息 (聚焦配置码后 Ctrl+C)"
          >
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          把这一行发给别人，就能一眼看清整机配置 · 聚焦配置码后按 Ctrl+C 也能复制
          <Sparkles
            size={12}
            strokeWidth={2}
            style={{ display: "inline", verticalAlign: "-2px", marginLeft: 4, color: "var(--color-accent)" }}
            aria-hidden="true"
          />
        </p>
      </GlassCard>
    </div>
  );
}
