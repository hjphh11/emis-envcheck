/**
 * 报告导出：自包含 HTML（内联 CSS、不引任何外部资源）与 JSON。
 * 暖色排版与界面同源，脱离程序也能在浏览器里直接打开。
 *
 * 安全约定：SMBIOS / 磁盘型号 / 软件名等字符串来自硬件与注册表，属**半可信输入**。
 * 所有进入 HTML 的值都必须经过 esc()；只有本文件自己拼的标签才允许直接进模板，
 * 需要 HTML 的键值行走 rowHtml()，普通键值行走 row()（内部自动转义）。
 */
import type {
  AppInfo,
  CheckStatus,
  MotherboardInfo,
  ScanResult,
  SecurityInfo,
  SoftwareItem,
} from "../types";
import {
  SOFTWARE_CATEGORY_ORDER,
  diskHealthInfo,
  fmtBytes,
  fmtCores,
  fmtDate,
  fmtDateTime,
  fmtMhz,
  fmtPct,
  fmtUptime,
  levelInfo,
  normalizeCheckStatus,
  normalizeVerdict,
  softwareCategoryLabel,
  text,
} from "./format";

const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: "通过",
  warn: "注意",
  fail: "不通过",
  unknown: "未知",
};

const STATUS_TONE: Record<CheckStatus, string> = {
  pass: "ok",
  warn: "warn",
  fail: "fail",
  unknown: "unknown",
};

const VERDICT_TEXT: Record<"ok" | "warn" | "blocked", string> = {
  ok: "可以升级",
  warn: "有风险项",
  blocked: "不满足",
};

/** 所有插值到 HTML 的字符串都走这里（含引号，避免属性闭合注入） */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 值兜底 + 转义：null / 空串 → 未知 */
function val(v: unknown, fallback = "未知"): string {
  if (v == null || v === "") return fallback;
  return esc(v);
}

/** 数组兜底：缺失 / 非数组（老采集器或损坏数据）一律当空数组，避免整份报告抛异常 */
function arr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** 布尔三态 → 是 / 否 / 未知（null 不当成「否」） */
function triText(v: boolean | null | undefined): string {
  return v == null ? "未知" : v ? "是" : "否";
}

/** 普通键值行：值由本函数统一转义 */
function row(k: string, v: unknown): string {
  return `<tr><th>${esc(k)}</th><td>${val(v)}</td></tr>`;
}

/** 需要嵌标签（mono / 状态徽章）的键值行：调用方必须自己保证 html 安全 */
function rowHtml(k: string, html: string): string {
  return `<tr><th>${esc(k)}</th><td>${html}</td></tr>`;
}

function table(headers: string[], rows: string[], extraClass = ""): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  return `<table class="tbl ${extraClass}"><thead><tr>${head}</tr></thead><tbody>${rows.join(
    "",
  )}</tbody></table>`;
}

/** 结论徽章：非法枚举先归一化，避免出现 badge--undefined / 空文案 */
function badge(status: unknown): string {
  const s = normalizeCheckStatus(status);
  return `<span class="badge badge--${STATUS_TONE[s]}">${STATUS_TEXT[s]}</span>`;
}

/** 页脚固定文案 */
const FOOTER = "制作 清吾 · qingwu.ink ｜ 主题形象 爱弥斯";

export function buildJsonReport(scan: ScanResult): string {
  return JSON.stringify(scan, null, 2);
}

/** 文件名：爱弥斯环境检测报告-20261018-1930.html */
export function reportFileName(ext: "html" | "json"): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
  return `爱弥斯环境检测报告-${stamp}.${ext}`;
}

/** 已安装软件按分类分组（未知分类归到「其他」，不静默丢弃） */
function groupSoftware(items: SoftwareItem[]): Array<{
  title: string;
  items: SoftwareItem[];
}> {
  const known = SOFTWARE_CATEGORY_ORDER.map((category) => ({
    title: softwareCategoryLabel(category),
    items: items.filter((s) => s.category === category),
  }));
  const other = items.filter(
    (s) => !SOFTWARE_CATEGORY_ORDER.includes(s.category),
  );
  const groups = known.filter((g) => g.items.length > 0);
  if (other.length) groups.push({ title: softwareCategoryLabel(undefined), items: other });
  return groups;
}

export function buildHtmlReport(scan: ScanResult, info: AppInfo | null): string {
  /* 老采集器 / 异常数据 / 被删字段都可能缺块：顶层一律 ?? {}，数组一律 ?? []，
     保证「删掉任意 section」时报告仍能完整生成，而不是整份抛异常。 */
  const meta = scan.meta ?? ({} as ScanResult["meta"]);
  const system = scan.system ?? ({} as ScanResult["system"]);
  const cpu = scan.cpu ?? ({} as ScanResult["cpu"]);
  const memory = scan.memory ?? ({} as ScanResult["memory"]);
  const gpus = arr(scan.gpus);
  const displays = arr(scan.displays);
  const disks = arr(scan.disks);
  const network = scan.network ?? ({} as ScanResult["network"]);
  const runtime = scan.runtime ?? ({} as ScanResult["runtime"]);
  const compat = scan.compat ?? ({} as ScanResult["compat"]);
  const score = scan.score ?? ({} as ScanResult["score"]);
  const motherboard: Partial<MotherboardInfo> = scan.motherboard ?? {};
  const security: Partial<SecurityInfo> = scan.security ?? {};

  const scoreParts = arr(score.parts);
  const memoryModules = arr(memory.modules);
  const adapters = arr(network.adapters);
  const compatItems = arr(compat.items);
  const dotnetFramework = arr(runtime.dotnetFramework);
  const dotnetRuntimes = arr(runtime.dotnetRuntimes);
  const vcpp = arr(runtime.vcpp);
  const javaTools = arr(runtime.java);
  const software = arr(runtime.software);
  const directx = runtime.directx ?? ({} as ScanResult["runtime"]["directx"]);
  const webview2 =
    runtime.webview2 ?? ({} as ScanResult["runtime"]["webview2"]);
  const wsl = runtime.wsl ?? ({} as ScanResult["runtime"]["wsl"]);
  const warnings = arr(meta.warnings).filter(
    (w): w is string => typeof w === "string" && w.trim().length > 0,
  );

  const level = levelInfo(score.total);
  const verdict = normalizeVerdict(compat.verdict);
  const verdictText = VERDICT_TEXT[verdict];

  /* —— 体检 —— */
  const scoreRows = scoreParts.map(
    (p) =>
      `<tr><th>${esc(p.label)}</th><td class="num">${esc(
        p.score,
      )}</td><td class="num subtle">${Math.round(
        (p.weight ?? 0) * 100,
      )}%</td><td>${p.note ? esc(p.note) : "—"}</td></tr>`,
  );

  const systemRows = [
    row("操作系统", system.caption),
    /* 这里刻意用 text() 而非 esc()：row() 会统一转义，先转义会变成双重转义 */
    row(
      "版本",
      `${text(system.version)}${system.ubr ? ` (UBR ${system.ubr})` : ""}${
        system.displayVersion ? ` · ${system.displayVersion}` : ""
      }`,
    ),
    row("架构", system.arch),
    row("激活状态", system.activation),
    row("计算机名", system.hostname),
    row("当前用户", system.username),
    row("域 / 工作组", system.domain),
    row("运行时长", fmtUptime(system.uptimeSec)),
    row("分辨率", system.resolution),
    row("刷新率", system.refreshHz ? `${system.refreshHz} Hz` : "未知"),
    /* 整机型号来自 SMBIOS，必须转义（曾被 <img onerror> 原样注入） */
    row(
      "整机型号",
      [system.manufacturer, system.model].filter(Boolean).join(" ") || "未知",
    ),
    rowHtml("整机序列号", `<span class="mono">${val(system.serial)}</span>`),
    row("快速启动", triText(system.fastStartup)),
    row("Hyper-V", triText(system.hyperV)),
    row("安装日期", fmtDate(system.installDate)),
    row("上次启动", fmtDateTime(system.lastBoot)),
    row("时区", system.timeZone),
  ];

  /* —— 主板与固件 —— */
  const boardName =
    [motherboard.vendor, motherboard.model].filter(Boolean).join(" ") || null;
  const biosName =
    [motherboard.biosVendor, motherboard.biosVersion].filter(Boolean).join(" ") ||
    null;
  const boardTpm = motherboard.tpmVersion
    ? `${motherboard.tpmVersion}${motherboard.tpmEnabled ? "（已启用）" : "（已停用）"}`
    : null;

  const motherboardRows = [
    row("主板", boardName),
    row("版本", motherboard.version),
    row("BIOS", biosName),
    row("BIOS 日期", fmtDate(motherboard.biosDate)),
    row("固件类型", motherboard.firmwareMode),
    row("安全启动", triText(motherboard.secureBoot)),
    row("TPM", boardTpm),
    rowHtml(
      "整机序列号",
      `<span class="mono">${val(motherboard.serial)}</span>`,
    ),
  ];

  /* —— 安全 —— */
  const antivirus = arr(security.antivirus);
  const defenderText =
    security.defenderRealtime == null
      ? "未知"
      : security.defenderRealtime
        ? "已开启"
        : "已关闭";

  const securityRows = [
    row("实时保护", defenderText),
    row("第三方杀软", antivirus.length ? antivirus.join("、") : "未检测到"),
    row("防火墙", security.firewall),
    row("用户账户控制", security.uac),
    row("安全启动", triText(security.secureBoot)),
    row("TPM", security.tpm),
    row("BitLocker", system.bitLocker),
  ];

  const cpuRows = [
    row("型号", cpu.brand),
    row("核心/线程", fmtCores(cpu.physicalCores, cpu.logicalCores)),
    row("基准频率", fmtMhz(cpu.baseMhz)),
    row("最高频率", fmtMhz(cpu.maxMhz)),
    row("插槽", cpu.socket),
    row(
      "虚拟化",
      cpu.virtualization == null ? "未知" : cpu.virtualization ? "支持" : "未开启",
    ),
    row("缓存", `L2 ${fmtBytes(cpu.l2Bytes)} · L3 ${fmtBytes(cpu.l3Bytes)}`),
    row(
      "指令集",
      arr(cpu.instructions).length
        ? arr(cpu.instructions).join(" / ")
        : "未检测到",
    ),
  ];

  const memoryRows = memoryModules.map((m, idx) => {
    const slot = m.slot ? esc(m.slot) : `内存条 ${idx + 1}`;
    const voltage = m.voltageMv ? `${(m.voltageMv / 1000).toFixed(2)} V` : null;
    const detail =
      [
        m.type,
        m.speedMhz ? `${m.speedMhz} MHz` : null,
        m.manufacturer,
        m.partNumber,
        voltage,
      ]
        .filter(Boolean)
        .map((s) => esc(s))
        .join(" · ") || "—";
    return `<tr><td>${slot}</td><td>${fmtBytes(
      m.capacityBytes,
    )}</td><td>${detail}</td></tr>`;
  });

  const gpuRows = gpus.map(
    (g) =>
      `<tr><td>${esc(g.name)}</td><td>${fmtBytes(g.vramBytes)}</td><td>${val(
        g.driverVersion,
      )}</td><td>${
        g.discrete == null ? "未知" : g.discrete ? "独立显卡" : "集成显卡"
      }</td></tr>`,
  );

  const diskRows = disks.flatMap((d) => {
    const health = diskHealthInfo(d.health);
    const healthCell = `${health.text}${
      d.healthPct != null ? ` ${esc(d.healthPct)}%` : ""
    }`;
    const name = `${esc(d.model)}${
      d.mediaType ? ` · ${esc(d.mediaType)}` : ""
    }${d.firmware ? `<br /><span class="subtle mono">固件 ${esc(d.firmware)}</span>` : ""}`;
    const volumes = arr(d.volumes);
    return (volumes.length ? volumes : [null]).map(
      (v, idx) =>
        `<tr><td>${idx === 0 ? name : ""}</td><td>${val(
          d.interfaceType,
        )}</td><td>${fmtBytes(d.totalBytes)}</td><td>${healthCell}</td><td>${
          v
            ? `${esc(v.drive)}${v.label ? ` ${esc(v.label)}` : ""} ${
                v.fs ? `${esc(v.fs)} · ` : ""
              }${fmtBytes(v.freeBytes)} 可用 / ${fmtBytes(v.totalBytes)}`
            : "—"
        }</td></tr>`,
    );
  });

  const adapterRows = adapters.map(
    (a) =>
      `<tr><td>${esc(a.name)}</td><td>${val(a.type)}</td><td>${val(
        a.ipv4,
      )}</td><td>${a.speedMbps ? `${esc(a.speedMbps)} Mbps` : "未知"}</td><td>${
        a.ssid ? esc(a.ssid) : "—"
      }</td><td>${a.connected ? "已连接" : "未连接"}</td></tr>`,
  );

  /* —— 运行环境 —— */
  const runtimeRows: string[] = [];
  dotnetFramework.forEach((d) => {
    runtimeRows.push(
      `<tr><td>.NET Framework</td><td>${esc(d.version)}</td><td>${
        d.installed ? "已安装" : "未安装"
      }</td><td>—</td></tr>`,
    );
  });
  dotnetRuntimes.forEach((d) => {
    runtimeRows.push(
      `<tr><td>${esc(d.name)}</td><td>${esc(d.version)}</td><td>已安装</td><td>—</td></tr>`,
    );
  });
  vcpp.forEach((v) => {
    runtimeRows.push(
      `<tr><td>VC++ ${esc(v.year)} (${esc(v.arch)})</td><td>${esc(
        v.version,
      )}</td><td>已安装</td><td>—</td></tr>`,
    );
  });
  runtimeRows.push(
    `<tr><td>DirectX</td><td>${val(directx.version)}</td><td>${
      directx.d3d12 ? "D3D12 可用" : "未知"
    }</td><td>WDDM ${val(directx.wddm)}${
      directx.featureLevel ? ` · 特性级别 ${esc(directx.featureLevel)}` : ""
    }</td></tr>`,
  );
  runtimeRows.push(
    `<tr><td>WebView2</td><td>${val(webview2.version)}</td><td>${
      webview2.installed == null
        ? "未知"
        : webview2.installed
          ? "已安装"
          : "未安装"
    }</td><td>—</td></tr>`,
  );
  const tools = [javaTools, [runtime.node], [runtime.python], [runtime.git]]
    .flat()
    .filter((t): t is NonNullable<typeof t> => t != null);
  tools.forEach((t) => {
    runtimeRows.push(
      `<tr><td>${esc(t.name)}</td><td>${val(t.version)}</td><td>已安装</td><td class="mono">${val(
        t.path,
        "—",
      )}${t.source ? `<span class="subtle"> · ${esc(t.source)}</span>` : ""}</td></tr>`,
    );
  });
  runtimeRows.push(
    `<tr><td>WSL</td><td>${val(wsl.version)}</td><td>${
      wsl.installed == null
        ? "未知"
        : wsl.installed
          ? "已安装"
          : "未安装"
    }</td><td>${
      arr(wsl.distros).length ? esc(arr(wsl.distros).join("、")) : "—"
    }</td></tr>`,
  );

  /* —— 已安装软件（v1.2 主打功能，之前整节漏渲染） —— */
  const softwareGroups = groupSoftware(software);
  const softwareSections = softwareGroups
    .map((g) => {
      const rows = g.items.map((s) => {
        const running =
          s.running == null ? "—" : s.running ? "运行中" : "未运行";
        const where = s.path
          ? `<span class="mono">${esc(s.path)}</span>`
          : s.detail
            ? esc(s.detail)
            : "—";
        return `<tr><td>${esc(s.name)}</td><td>${val(
          s.version,
          "—",
        )}</td><td>${running}</td><td>${where}${
          s.path && s.detail ? `<br /><span class="subtle">${esc(s.detail)}</span>` : ""
        }</td></tr>`;
      });
      return `<h3 class="subhead">${esc(g.title)} <span class="subtle">${
        g.items.length
      } 个</span></h3>${table(["名称", "版本", "运行状态", "路径 / 备注"], rows)}`;
    })
    .join("");

  const softwareCard = software.length
    ? `<section class="card">
    <h2>已安装软件</h2>
    <p class="subtle" style="margin:0 0 12px;font-size:12px">共检测到 ${software.length} 个软件，按分类列出。</p>
    ${softwareSections}
  </section>`
    : `<section class="card">
    <h2>已安装软件</h2>
    <p class="subtle">未检测到数据库 / 容器 / Web 服务 / 开发语言 / 开发工具类软件。</p>
  </section>`;

  /* —— 兼容性 —— */
  const compatRows = compatItems.map((it) => {
    const status = normalizeCheckStatus(it.status);
    return `<tr class="status-${STATUS_TONE[status]}">
      <td>${esc(it.name)}</td>
      <td>${badge(it.status)}</td>
      <td>${val(it.actual)}</td>
      <td>${val(it.requirement)}</td>
      <td>${it.reason ? esc(it.reason) : "—"}</td>
    </tr>`;
  });

  /* —— 监控（采集时快照） —— */
  const monitorRows = [
    row("CPU 占用", fmtPct(cpu.usagePct, 1)),
    row("当前频率", fmtMhz(cpu.currentMhz)),
    row(
      "内存使用",
      `${fmtBytes(memory.usedBytes)} / ${fmtBytes(
        memory.totalBytes,
      )}（${fmtPct(memory.usedPct, 1)}）`,
    ),
    row(
      "网络",
      network.internet == null
        ? "未知"
        : network.internet
          ? `已联网 · 延迟 ${
              network.latencyMs != null ? `${network.latencyMs} ms` : "未知"
            }`
          : "未联网",
    ),
    /* 磁盘健康在报告里曾直接打印 healthy 英文枚举，这里统一成中文 */
    row(
      "磁盘健康",
      disks.length
        ? disks
            .map((d) => `${d.model}：${diskHealthInfo(d.health).text}`)
            .join("；")
        : "未检测到",
    ),
  ];

  /* —— 采集说明（meta.warnings 的出口；为空时不渲染整节） —— */
  const warningsCard = warnings.length
    ? `<section class="card">
    <h2>采集说明</h2>
    <p class="subtle" style="margin:0 0 10px;font-size:12px">下列项目本次没有采到或采得不全，报告里对应的「未知」是「没读到」而不是「机器没有」。</p>
    <ul class="warnlist">${warnings
      .map((w) => `<li>${esc(w)}</li>`)
      .join("")}</ul>
  </section>`
    : "";

  const generatedAt = fmtDateTime(meta.generatedAt);
  const appName = info?.name || "爱弥斯 · 环境检测";
  const appVersion = info?.version || "1.3.0";
  const scanSec = Number.isFinite(meta.scanMs)
    ? `${(meta.scanMs / 1000).toFixed(1)} 秒`
    : "未知";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(appName)} · 检测报告</title>
<style>
  :root {
    --rose: #f6a5b8;
    --crimson: #c23a55;
    --cream: #fdf6f0;
    --amber: #e8b04b;
    --ink: #4a3728;
    --muted: rgba(74, 55, 40, 0.9);
    --subtle: rgba(74, 55, 40, 0.75);
    --hairline: rgba(194, 58, 85, 0.16);
    --ok: #4a7a4a;
    --warn: #8a5f14;
    --fail: #a8324a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 20px 56px;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    font-size: 14px;
    line-height: 1.7;
    color: var(--ink);
    background-color: var(--cream);
    background-image:
      radial-gradient(60rem 36rem at 6% -10%, rgba(246,165,184,.30) 0%, transparent 68%),
      radial-gradient(52rem 34rem at 100% 2%, rgba(232,176,75,.18) 0%, transparent 70%);
    background-repeat: no-repeat;
  }
  .page { max-width: 980px; margin: 0 auto; }
  .head {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px 20px;
    padding-bottom: 16px; border-bottom: 1px solid var(--hairline);
  }
  .head h1 {
    margin: 0; font-size: 30px; line-height: 1.25; font-weight: 400;
    font-family: "Songti SC", "Noto Serif SC", "SimSun", serif; letter-spacing: .01em;
  }
  .head h1::before {
    content: ""; display: inline-block; width: 6px; height: .95em;
    margin-right: 12px; border-radius: 99px; vertical-align: -2px;
    background: linear-gradient(to bottom, var(--crimson), var(--amber));
  }
  .head .meta { margin-left: auto; font-size: 12px; color: var(--subtle); text-align: right; }
  .card {
    margin-top: 22px; padding: 20px 22px;
    border-radius: 18px; background: rgba(255,255,255,.62);
    border: 1px solid rgba(255,255,255,.8);
    box-shadow: 0 10px 30px rgba(246,165,184,.16);
  }
  h2 {
    margin: 0 0 14px; font-size: 20px; font-weight: 400;
    font-family: "Songti SC", "Noto Serif SC", "SimSun", serif;
    display: flex; align-items: center; gap: 10px;
  }
  h2::before { content: ""; width: 5px; height: .9em; border-radius: 99px; background: var(--crimson); }
  h3.subhead {
    margin: 18px 0 8px; font-size: 14px; font-weight: 600;
    color: var(--muted); letter-spacing: .02em;
  }
  h3.subhead:first-of-type { margin-top: 0; }
  .score-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 16px; margin-bottom: 14px; }
  .score-num {
    font-size: 52px; line-height: 1; font-weight: 400;
    font-family: "Songti SC", "Noto Serif SC", "SimSun", serif; color: var(--ink);
  }
  .score-num small { font-size: 15px; color: var(--subtle); margin-left: 6px; }
  .score-level {
    padding: 2px 12px; border-radius: 99px; font-size: 13px;
    color: var(--crimson); background: rgba(246,165,184,.32);
  }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tbl th, .tbl td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  .tbl thead th { font-size: 11.5px; letter-spacing: .06em; color: var(--subtle); font-weight: 600; background: rgba(246,165,184,.14); }
  .tbl tbody tr:last-child th, .tbl tbody tr:last-child td { border-bottom: 0; }
  .tbl th { font-weight: 400; color: var(--subtle); width: 132px; white-space: nowrap; }
  .tbl thead th { width: auto; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .subtle { color: var(--subtle); }
  .mono { font-family: Consolas, "Cascadia Mono", monospace; font-size: 12px; overflow-wrap: anywhere; }
  .badge {
    display: inline-block; padding: 0 9px; border-radius: 99px;
    font-size: 11.5px; white-space: nowrap;
  }
  .badge--ok { color: var(--ok); background: rgba(95,138,95,.14); }
  .badge--warn { color: var(--warn); background: rgba(232,176,75,.20); }
  .badge--fail { color: var(--fail); background: rgba(194,58,85,.12); }
  .badge--unknown { color: var(--subtle); background: rgba(139,90,60,.10); }
  tr.status-fail td { background: rgba(194,58,85,.05); }
  tr.status-warn td { background: rgba(232,176,75,.08); }
  .verdict { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px; margin-bottom: 14px; }
  .verdict strong { font-size: 22px; font-weight: 400; font-family: "Songti SC", "Noto Serif SC", serif; }
  .counts { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); }
  .counts span { padding: 1px 10px; border-radius: 99px; background: rgba(255,255,255,.7); border: 1px solid var(--hairline); }
  .warnlist { margin: 0; padding-left: 20px; font-size: 13px; color: var(--muted); }
  .warnlist li { margin: 4px 0; }
  .foot {
    margin-top: 30px; padding-top: 16px; border-top: 1px dashed var(--hairline);
    display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: space-between;
    font-size: 12px; color: var(--subtle);
  }
  .foot .hand { color: var(--crimson); font-family: "STKaiti", "KaiTi", serif; font-size: 14px; }
  @media print {
    body { padding: 0; background: #fff; }
    .card { break-inside: avoid; box-shadow: none; border: 1px solid #eee; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="head">
    <h1>${esc(appName)} · 检测报告</h1>
    <div class="meta">
      生成时间：${esc(generatedAt)}<br />
      采集耗时：${esc(scanSec)} · ${meta.isAdmin ? "管理员权限" : "普通权限"}<br />
      采集器 ${val(meta.collectorVersion)} · 程序 v${esc(appVersion)}${
        warnings.length ? `<br />采集说明：${warnings.length} 条（见文末）` : ""
      }
    </div>
  </header>

  <section class="card">
    <h2>综合评分</h2>
    <div class="score-line">
      <div class="score-num">${score.total == null ? "--" : esc(score.total)}<small>/ 100</small></div>
      <span class="score-level">${esc(level.label)}</span>
      <span class="subtle">系统状态：${esc(verdictText)}</span>
    </div>
    ${
      scoreRows.length
        ? table(["维度", "得分", "权重", "依据"], scoreRows)
        : '<p class="subtle">未获取到评分明细。</p>'
    }
  </section>

  <section class="card">
    <h2>系统</h2>
    ${table(["项目", "值"], systemRows)}
  </section>

  <section class="card">
    <h2>主板与固件</h2>
    ${table(["项目", "值"], motherboardRows)}
  </section>

  <section class="card">
    <h2>安全</h2>
    ${table(["项目", "值"], securityRows)}
  </section>

  <section class="card">
    <h2>处理器</h2>
    ${table(["项目", "值"], cpuRows)}
  </section>

  <section class="card">
    <h2>内存</h2>
    <div class="score-line">
      <div class="score-num" style="font-size:30px">${fmtBytes(memory.usedBytes)}<small>/ ${fmtBytes(memory.totalBytes)}</small></div>
      <span class="score-level">${fmtPct(memory.usedPct, 1)}</span>
      <span class="subtle">${
        memory.dualChannelHint == null
          ? "通道未知"
          : memory.dualChannelHint
            ? "双通道"
            : "单通道"
      } · 可用 ${fmtBytes(memory.availableBytes)}</span>
    </div>
    ${
      memoryRows.length
        ? table(["插槽", "容量", "详情"], memoryRows)
        : '<p class="subtle">未检测到内存条明细。</p>'
    }
  </section>

  <section class="card">
    <h2>显卡与显示</h2>
    ${
      gpuRows.length
        ? table(["显卡", "显存", "驱动版本", "类型"], gpuRows)
        : '<p class="subtle">未检测到显卡。</p>'
    }
    ${
      displays.length
        ? table(
            ["显示器", "厂商", "分辨率", "刷新率", "尺寸", "主屏"],
            displays.map(
              (d) =>
                `<tr><td>${val(d.name)}</td><td>${val(
                  d.manufacturer,
                )}</td><td>${val(d.resolution)}</td><td>${
                  d.refreshHz ? `${esc(d.refreshHz)} Hz` : "未知"
                }</td><td>${
                  d.sizeInch ? `${esc(d.sizeInch)} 英寸` : "未知"
                }</td><td>${d.primary ? "是" : "否"}</td></tr>`,
            ),
          )
        : '<p class="subtle">未检测到显示器信息。</p>'
    }
  </section>

  <section class="card">
    <h2>硬盘</h2>
    ${
      diskRows.length
        ? table(["型号", "接口", "容量", "健康", "分区"], diskRows)
        : '<p class="subtle">未检测到硬盘。</p>'
    }
  </section>

  <section class="card">
    <h2>网络</h2>
    ${
      adapterRows.length
        ? table(["适配器", "类型", "IPv4", "速率", "Wi-Fi", "状态"], adapterRows)
        : '<p class="subtle">未检测到网络适配器。</p>'
    }
  </section>

  <section class="card">
    <h2>运行环境</h2>
    ${
      runtimeRows.length
        ? table(["组件", "版本", "状态", "路径 / 说明"], runtimeRows)
        : '<p class="subtle">未获取到运行环境信息。</p>'
    }
  </section>

  ${softwareCard}

  <section class="card">
    <h2>兼容性</h2>
    <div class="verdict">
      <strong>${esc(verdictText)}</strong>
      <div class="counts">
        <span>通过 ${esc(compat.passCount ?? 0)}</span>
        <span>风险 ${esc(compat.warnCount ?? 0)}</span>
        <span>不满足 ${esc(compat.failCount ?? 0)}</span>
        <span>未知 ${esc(compat.unknownCount ?? 0)}</span>
      </div>
    </div>
    ${
      compatRows.length
        ? table(["检测项", "结论", "实测值", "要求", "说明"], compatRows)
        : '<p class="subtle">未检测到兼容性项目。</p>'
    }
  </section>

  <section class="card">
    <h2>监控（采集时快照）</h2>
    ${table(["指标", "值"], monitorRows)}
    <p class="subtle" style="margin:12px 0 0;font-size:12px">实时曲线只在程序内展示，报告只保留采集瞬间的数值。</p>
  </section>

  ${warningsCard}

  <footer class="foot">
    <span class="hand">${esc(FOOTER)}</span>
    <span>${esc(appName)} v${esc(appVersion)} · ${esc(
      fmtDate(meta.generatedAt),
    )}</span>
  </footer>
</div>
</body>
</html>`;
}
