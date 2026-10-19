/**
 * 报告导出：自包含 HTML（内联 CSS、不引任何外部资源）与 JSON。
 * 暖色排版与界面同源，脱离程序也能在浏览器里直接打开。
 */
import type {
  AppInfo,
  CheckStatus,
  MotherboardInfo,
  ScanResult,
  SecurityInfo,
} from "../types";
import {
  fmtBytes,
  fmtCores,
  fmtDate,
  fmtDateTime,
  fmtMhz,
  fmtPct,
  fmtSpeed,
  fmtUptime,
  levelInfo,
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

const VERDICT_TEXT = {
  ok: "可以升级",
  warn: "有风险项",
  blocked: "不满足",
} as const;

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function val(v: unknown, fallback = "未知"): string {
  if (v == null || v === "") return fallback;
  return esc(v);
}

/** 布尔三态 → 是 / 否 / 未知（null 不当成「否」） */
function triText(v: boolean | null | undefined): string {
  return v == null ? "未知" : v ? "是" : "否";
}

function row(k: string, v: string): string {
  return `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
}

function table(headers: string[], rows: string[], extraClass = ""): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  return `<table class="tbl ${extraClass}"><thead><tr>${head}</tr></thead><tbody>${rows.join(
    "",
  )}</tbody></table>`;
}

function badge(status: CheckStatus): string {
  return `<span class="badge badge--${STATUS_TONE[status]}">${STATUS_TEXT[status]}</span>`;
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

export function buildHtmlReport(scan: ScanResult, info: AppInfo | null): string {
  const { meta, system, cpu, memory, gpus, disks, network, runtime, compat, score } =
    scan;
  /* 老采集器 / 异常数据可能缺这两块，统一兜底成空对象 */
  const motherboard: Partial<MotherboardInfo> = scan.motherboard ?? {};
  const security: Partial<SecurityInfo> = scan.security ?? {};
  const level = levelInfo(score.total);
  const verdictText = VERDICT_TEXT[compat.verdict] ?? "未知";

  /* —— 体检 —— */
  const scoreRows = score.parts.map(
    (p) =>
      `<tr><th>${esc(p.label)}</th><td class="num">${esc(
        p.score,
      )}</td><td class="num subtle">${Math.round(p.weight * 100)}%</td><td>${
        p.note ? esc(p.note) : "—"
      }</td></tr>`,
  );

  const systemRows = [
    row("操作系统", val(system.caption)),
    row(
      "版本",
      `${val(system.version)}${system.ubr ? ` (UBR ${esc(system.ubr)})` : ""}${
        system.displayVersion ? ` · ${esc(system.displayVersion)}` : ""
      }`,
    ),
    row("架构", val(system.arch)),
    row("激活状态", val(system.activation)),
    row("计算机名", val(system.hostname)),
    row("当前用户", val(system.username)),
    row("运行时长", fmtUptime(system.uptimeSec)),
    row("分辨率", system.resolution ? esc(system.resolution) : "未知"),
    row("刷新率", system.refreshHz ? `${esc(system.refreshHz)} Hz` : "未知"),
    row("整机型号", [system.manufacturer, system.model].filter(Boolean).join(" ") || "未知"),
    row("安装日期", fmtDate(system.installDate)),
    row("上次启动", fmtDateTime(system.lastBoot)),
    row("时区", val(system.timeZone)),
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
    row("主板", val(boardName)),
    row("版本", val(motherboard.version)),
    row("BIOS", val(biosName)),
    row("BIOS 日期", fmtDate(motherboard.biosDate)),
    row("固件类型", val(motherboard.firmwareMode)),
    row("安全启动", triText(motherboard.secureBoot)),
    row("TPM", val(boardTpm)),
    row("整机序列号", `<span class="mono">${val(motherboard.serial)}</span>`),
  ];

  /* —— 安全 —— */
  const antivirus = security.antivirus ?? [];
  const defenderText =
    security.defenderRealtime == null
      ? "未知"
      : security.defenderRealtime
        ? "已开启"
        : "已关闭";

  const securityRows = [
    row("实时保护", defenderText),
    row("第三方杀软", antivirus.length ? esc(antivirus.join("、")) : "未检测到"),
    row("防火墙", val(security.firewall)),
    row("用户账户控制", val(security.uac)),
    row("安全启动", triText(security.secureBoot)),
    row("TPM", val(security.tpm)),
  ];

  const cpuRows = [
    row("型号", val(cpu.brand)),
    row("核心/线程", fmtCores(cpu.physicalCores, cpu.logicalCores)),
    row("基准频率", fmtMhz(cpu.baseMhz)),
    row("最高频率", fmtMhz(cpu.maxMhz)),
    row("插槽", val(cpu.socket)),
    row("虚拟化", cpu.virtualization == null ? "未知" : cpu.virtualization ? "支持" : "未开启"),
    row("缓存", `L2 ${fmtBytes(cpu.l2Bytes)} · L3 ${fmtBytes(cpu.l3Bytes)}`),
    row("指令集", cpu.instructions.length ? esc(cpu.instructions.join(" / ")) : "未检测到"),
  ];

  const memoryRows = memory.modules.map(
    (m) =>
      `<tr><td>${m.slot ? esc(m.slot) : `内存条 ${esc(
        memory.modules.indexOf(m) + 1,
      )}`}</td><td>${fmtBytes(m.capacityBytes)}</td><td>${[
        m.type,
        m.speedMhz ? `${m.speedMhz} MHz` : null,
        m.manufacturer,
        m.partNumber,
      ]
        .filter(Boolean)
        .map((s) => esc(s))
        .join(" · ") || "—"}</td></tr>`,
  );

  const gpuRows = gpus.map(
    (g) =>
      `<tr><td>${esc(g.name)}</td><td>${fmtBytes(g.vramBytes)}</td><td>${val(
        g.driverVersion,
      )}</td><td>${g.discrete == null ? "未知" : g.discrete ? "独立显卡" : "集成显卡"}</td></tr>`,
  );

  const diskRows = disks.flatMap((d) =>
    (d.volumes.length ? d.volumes : [null]).map(
      (v, idx) =>
        `<tr><td>${
          idx === 0
            ? `${esc(d.model)}${d.mediaType ? ` · ${esc(d.mediaType)}` : ""}`
            : ""
        }</td><td>${val(d.interfaceType)}</td><td>${fmtBytes(d.totalBytes)}</td><td>${
          d.healthPct != null ? `${esc(d.healthPct)}%` : "—"
        }</td><td>${
          v
            ? `${esc(v.drive)} ${fmtBytes(v.freeBytes)} 可用 / ${fmtBytes(
                v.totalBytes,
              )}`
            : "—"
        }</td></tr>`,
    ),
  );

  const adapterRows = network.adapters.map(
    (a) =>
      `<tr><td>${esc(a.name)}</td><td>${val(a.type)}</td><td>${val(
        a.ipv4,
      )}</td><td>${a.speedMbps ? `${esc(a.speedMbps)} Mbps` : "未知"}</td><td>${
        a.ssid ? esc(a.ssid) : "—"
      }</td><td>${a.connected ? "已连接" : "未连接"}</td></tr>`,
  );

  /* —— 运行环境 —— */
  const runtimeRows: string[] = [];
  runtime.dotnetFramework.forEach((d) => {
    runtimeRows.push(
      `<tr><td>.NET Framework</td><td>${esc(d.version)}</td><td>${
        d.installed ? "已安装" : "未安装"
      }</td><td>—</td></tr>`,
    );
  });
  runtime.dotnetRuntimes.forEach((d) => {
    runtimeRows.push(
      `<tr><td>${esc(d.name)}</td><td>${esc(d.version)}</td><td>已安装</td><td>—</td></tr>`,
    );
  });
  runtime.vcpp.forEach((v) => {
    runtimeRows.push(
      `<tr><td>VC++ ${esc(v.year)} (${esc(v.arch)})</td><td>${esc(
        v.version,
      )}</td><td>已安装</td><td>—</td></tr>`,
    );
  });
  runtimeRows.push(
    `<tr><td>DirectX</td><td>${val(runtime.directx.version)}</td><td>${
      runtime.directx.d3d12 ? "D3D12 可用" : "未知"
    }</td><td>WDDM ${val(runtime.directx.wddm)}</td></tr>`,
  );
  runtimeRows.push(
    `<tr><td>WebView2</td><td>${val(runtime.webview2.version)}</td><td>${
      runtime.webview2.installed == null
        ? "未知"
        : runtime.webview2.installed
          ? "已安装"
          : "未安装"
    }</td><td>—</td></tr>`,
  );
  const tools = [
    ...runtime.java,
    runtime.node,
    runtime.python,
    runtime.git,
  ].filter((t): t is NonNullable<typeof t> => t != null);
  tools.forEach((t) => {
    runtimeRows.push(
      `<tr><td>${esc(t.name)}</td><td>${val(t.version)}</td><td>已安装</td><td class="mono">${val(
        t.path,
        "—",
      )}</td></tr>`,
    );
  });
  runtimeRows.push(
    `<tr><td>WSL</td><td>${val(runtime.wsl.version)}</td><td>${
      runtime.wsl.installed == null
        ? "未知"
        : runtime.wsl.installed
          ? "已安装"
          : "未安装"
    }</td><td>${runtime.wsl.distros.length ? esc(runtime.wsl.distros.join("、")) : "—"}</td></tr>`,
  );

  /* —— 兼容性 —— */
  const compatRows = compat.items.map(
    (it) => `<tr class="status-${STATUS_TONE[it.status]}">
      <td>${esc(it.name)}</td>
      <td>${badge(it.status)}</td>
      <td>${val(it.actual)}</td>
      <td>${val(it.requirement)}</td>
      <td>${it.reason ? esc(it.reason) : "—"}</td>
    </tr>`,
  );

  /* —— 监控（采集时快照） —— */
  const monitorRows = [
    row("CPU 占用", fmtPct(cpu.usagePct, 1)),
    row("当前频率", fmtMhz(cpu.currentMhz)),
    row("内存使用", `${fmtBytes(memory.usedBytes)} / ${fmtBytes(memory.totalBytes)}（${fmtPct(memory.usedPct, 1)}）`),
    row(
      "网络",
      network.internet == null
        ? "未知"
        : network.internet
          ? `已联网 · 延迟 ${network.latencyMs != null ? `${network.latencyMs} ms` : "未知"}`
          : "未联网",
    ),
    row("磁盘健康", disks.length ? disks.map((d) => `${d.model}：${d.health}`).join("；") : "未检测到"),
  ];

  const generatedAt = fmtDateTime(meta.generatedAt);
  const appName = info?.name || "爱弥斯 · 环境检测";
  const appVersion = info?.version || "1.2.0";

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
      采集耗时：${(meta.scanMs / 1000).toFixed(1)} 秒 · ${meta.isAdmin ? "管理员权限" : "普通权限"}<br />
      采集器 ${val(meta.collectorVersion)} · 程序 v${esc(appVersion)}
    </div>
  </header>

  <section class="card">
    <h2>综合评分</h2>
    <div class="score-line">
      <div class="score-num">${esc(score.total)}<small>/ 100</small></div>
      <span class="score-level">${esc(level.label)}</span>
      <span class="subtle">系统状态：${esc(verdictText)}</span>
    </div>
    ${table(
      ["维度", "得分", "权重", "依据"],
      scoreRows,
    )}
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
      <span class="subtle">${memory.dualChannelHint ? "双通道" : "通道未知"} · 可用 ${fmtBytes(memory.availableBytes)}</span>
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
      scan.displays.length
        ? table(
            ["显示器", "厂商", "分辨率", "刷新率", "尺寸", "主屏"],
            scan.displays.map(
              (d) =>
                `<tr><td>${val(d.name)}</td><td>${val(d.manufacturer)}</td><td>${val(
                  d.resolution,
                )}</td><td>${d.refreshHz ? `${esc(d.refreshHz)} Hz` : "未知"}</td><td>${
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
        ? table(["型号", "接口", "容量", "健康度", "分区"], diskRows)
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
    ${table(["组件", "版本", "状态", "路径 / 说明"], runtimeRows)}
  </section>

  <section class="card">
    <h2>兼容性</h2>
    <div class="verdict">
      <strong>${esc(verdictText)}</strong>
      <div class="counts">
        <span>通过 ${esc(compat.passCount)}</span>
        <span>风险 ${esc(compat.warnCount)}</span>
        <span>不满足 ${esc(compat.failCount)}</span>
        <span>未知 ${esc(compat.unknownCount)}</span>
      </div>
    </div>
    ${table(["检测项", "结论", "实测值", "要求", "说明"], compatRows)}
  </section>

  <section class="card">
    <h2>监控（采集时快照）</h2>
    ${table(["指标", "值"], monitorRows)}
    <p class="subtle" style="margin:12px 0 0;font-size:12px">实时曲线只在程序内展示，报告只保留采集瞬间的数值。</p>
  </section>

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
