import { Boxes, Sparkles } from "lucide-react";
import type {
  CheckStatus,
  ScanResult,
  SoftwareCategory,
  SoftwareItem,
} from "../../types";
import {
  SOFTWARE_CATEGORY_ORDER,
  softwareCategoryLabel,
  text,
} from "../../lib/format";
import { GlassCard } from "../ui/GlassCard";
import { StatusDot } from "../ui/StatusDot";

interface EnvRow {
  name: string;
  version: string | null;
  /** 路径；拿不到时放备注（Release / WDDM / 发行版名） */
  path: string | null;
  status: CheckStatus;
}

interface EnvGroup {
  key: string;
  title: string;
  summary: string;
  status: CheckStatus;
  rows: EnvRow[];
}

/** 版本号比较（只比数字段，够用） */
function versionAtLeast(v: string | null | undefined, min: number[]): boolean {
  if (!v) return false;
  const parts = v
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < min.length; i += 1) {
    const a = parts[i] ?? 0;
    if (a > min[i]) return true;
    if (a < min[i]) return false;
  }
  return true;
}

/** 软件分类的展示顺序与中文名统一放在 format.ts（报告也要用同一份） */
const SOFTWARE_ORDER: SoftwareCategory[] = SOFTWARE_CATEGORY_ORDER;

interface SoftwareGroup {
  key: string;
  title: string;
  items: SoftwareItem[];
}

/**
 * 按分类分组。
 * 采集器将来加了新枚举（或拼错）时，这些条目不能被静默丢弃——
 * 未知分类统一追加到「其他」分组，卡头计数才和总数对得上。
 */
function buildSoftwareGroups(scan: ScanResult): SoftwareGroup[] {
  const list = scan.runtime?.software ?? [];
  const groups: SoftwareGroup[] = SOFTWARE_ORDER.map((category) => ({
    key: category,
    title: softwareCategoryLabel(category),
    items: list.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
  const other = list.filter((s) => !SOFTWARE_ORDER.includes(s.category));
  if (other.length) {
    groups.push({ key: "other", title: softwareCategoryLabel(undefined), items: other });
  }
  return groups;
}

/** 一句手写体：这台机器适合跑什么 */
function fitSentence(scan: ScanResult): string {
  const memGB = (scan.memory?.totalBytes ?? 0) / 1024 ** 3;
  const hasDiscrete = (scan.gpus ?? []).some((g) => g.discrete === true);
  const rt = scan.runtime ?? ({} as ScanResult["runtime"]);
  const hasFw = (rt.dotnetFramework ?? []).some((d) => d.installed);
  const hasWebview = rt.webview2?.installed === true;
  const hasDev = Boolean(rt.node || rt.python || rt.git);
  const software = rt.software ?? [];
  const hasDb = software.some((s) => s.category === "database");
  const hasContainer = software.some((s) => s.category === "container");
  const hasWeb = software.some((s) => s.category === "webServer");

  const items: string[] = ["日常办公与网页浏览"];
  if (memGB >= 16) items.push("多任务与轻度创作");
  if (hasDev) items.push("本地开发与脚本自动化");
  else if (hasFw || hasWebview) items.push("常见 Windows 桌面软件");
  if (hasDb || hasContainer) items.push("数据库与容器");
  else if (hasWeb) items.push("本地 Web 服务");
  if (hasDiscrete && memGB >= 16) items.push("主流 3A 游戏");
  if (hasDiscrete && memGB >= 8) items.push("视频剪辑与 GPU 加速");

  return `这台机器适合跑：${items.slice(0, 5).join("、")}。`;
}

function buildGroups(scan: ScanResult): EnvGroup[] {
  /* 顶层块与子数组一律兜底：删掉任意 section 都不该整页崩 */
  const rt = scan.runtime ?? ({} as ScanResult["runtime"]);
  const fwList = rt.dotnetFramework ?? [];
  const dotnetRuntimes = rt.dotnetRuntimes ?? [];
  const vcppList = rt.vcpp ?? [];
  const javaList = rt.java ?? [];
  const directx = rt.directx ?? ({} as ScanResult["runtime"]["directx"]);
  const webview2 = rt.webview2 ?? ({} as ScanResult["runtime"]["webview2"]);
  const wslInfo = rt.wsl ?? ({} as ScanResult["runtime"]["wsl"]);
  const groups: EnvGroup[] = [];

  /* .NET Framework */
  const fw = fwList.filter((d) => d.installed);
  const fwLatest = fw.reduce<string>((best, d) => (versionAtLeast(d.version, best.split(".").map(Number)) ? d.version : best), "0");
  const fwStatus: CheckStatus = fw.length === 0 ? "fail" : versionAtLeast(fwLatest, [4, 8]) ? "pass" : "warn";
  groups.push({
    key: "netfx",
    title: ".NET Framework",
    summary:
      fw.length === 0
        ? "缺失"
        : fw.length === 1
          ? `v${fw[0].version}`
          : `${fw.length} 个版本`,
    status: fwStatus,
    rows:
      fw.length === 0
        ? [{ name: ".NET Framework 4.x", version: null, path: "未安装", status: "fail" as const }]
        : fw.map((d) => ({
            name: ".NET Framework",
            version: d.version,
            path: d.release ? `Release ${d.release}` : null,
            status: (versionAtLeast(d.version, [4, 8]) ? "pass" : "warn") as CheckStatus,
          })),
  });

  /* .NET 运行时（新版） */
  groups.push({
    key: "dotnet",
    title: ".NET 运行时",
    summary: dotnetRuntimes.length ? `${dotnetRuntimes.length} 个运行时` : "未检测到",
    status: dotnetRuntimes.length ? "pass" : "unknown",
    rows: dotnetRuntimes.length
      ? dotnetRuntimes.map((d) => ({
          name: d.name,
          version: d.version,
          path: "dotnet runtime",
          status: "pass" as const,
        }))
      : [{ name: ".NET 运行时", version: null, path: "未检测到", status: "unknown" as const }],
  });

  /* VC++ 运行库 */
  groups.push({
    key: "vcpp",
    title: "VC++ 运行库",
    summary: vcppList.length ? `${vcppList.length} 个版本` : "缺失",
    status: vcppList.length ? "pass" : "fail",
    rows: vcppList.length
      ? vcppList.map((v) => ({
          name: `Visual C++ ${v.year}`,
          version: v.version,
          path: v.arch,
          status: "pass" as const,
        }))
      : [{ name: "Visual C++ 运行库", version: null, path: "未安装", status: "fail" as const }],
  });

  /* DirectX */
  const dx = directx;
  const dxStatus: CheckStatus =
    dx.d3d12 == null && dx.major == null
      ? "unknown"
      : dx.d3d12 === false
        ? "fail"
        : (dx.major ?? 0) >= 12
          ? "pass"
          : "warn";
  groups.push({
    key: "directx",
    title: "DirectX",
    summary: dx.version ? `v${dx.version}` : "未知",
    status: dxStatus,
    rows: [
      {
        name: "DirectX 运行库",
        version: dx.version,
        path:
          [
            dx.d3d12 ? "D3D12 可用" : null,
            dx.wddm ? `WDDM ${dx.wddm}` : null,
            /* featureLevel 采集器已采到，之前没展示 */
            dx.featureLevel ? `特性级别 ${dx.featureLevel}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "未提供",
        status: dxStatus,
      },
    ],
  });

  /* WebView2 */
  const wv = webview2;
  const wvStatus: CheckStatus =
    wv.installed == null ? "unknown" : wv.installed ? "pass" : "fail";
  groups.push({
    key: "webview2",
    title: "WebView2",
    summary: wvStatus === "pass" ? "已安装" : wvStatus === "fail" ? "缺失" : "未知",
    status: wvStatus,
    rows: [
      {
        name: "Microsoft Edge WebView2",
        version: wv.version,
        path: wvStatus === "pass" ? "已安装" : "未检测到",
        status: wvStatus,
      },
    ],
  });

  /* Java */
  groups.push({
    key: "java",
    title: "Java 运行时",
    summary: javaList.length ? `${javaList.length} 个` : "未检测到",
    status: javaList.length ? "pass" : "unknown",
    rows: javaList.length
      ? javaList.map((j) => ({
          name: j.name,
          version: j.version,
          path: j.path,
          status: "pass" as const,
        }))
      : [{ name: "Java", version: null, path: "未检测到", status: "unknown" as const }],
  });

  /* Node / Python / Git */
  const single = (key: string, title: string, tool: typeof rt.node): EnvGroup => ({
    key,
    title,
    summary: tool ? `v${tool.version ?? "?"}` : "未检测到",
    status: tool ? "pass" : "unknown",
    rows: tool
      ? [{ name: tool.name, version: tool.version, path: tool.path, status: "pass" as const }]
      : [{ name: title, version: null, path: "未检测到", status: "unknown" as const }],
  });
  groups.push(single("node", "Node.js", rt.node));
  groups.push(single("python", "Python", rt.python));
  groups.push(single("git", "Git", rt.git));

  /* WSL */
  const wsl = wslInfo;
  const wslDistros = wsl.distros ?? [];
  const wslStatus: CheckStatus =
    wsl.installed == null ? "unknown" : wsl.installed ? "pass" : "unknown";
  groups.push({
    key: "wsl",
    title: "WSL",
    summary: wslStatus === "pass" ? `${wslDistros.length} 个发行版` : "未安装",
    status: wslStatus,
    rows: [
      {
        name: "Windows Subsystem for Linux",
        version: wsl.version,
        path: wslDistros.length ? wslDistros.join(" / ") : "未安装发行版",
        status: wslStatus,
      },
    ],
  });

  return groups;
}

/** 去掉采集器偶尔带上的包裹引号 */
function cleanPath(v: string | null | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();
}

export function Runtime({ scan, baseIndex = 0 }: { scan: ScanResult; baseIndex?: number }) {
  const rt = scan.runtime ?? ({} as ScanResult["runtime"]);
  const groups = buildGroups(scan);
  const installedCount = groups.filter((g) => g.status === "pass").length;
  const software = rt.software ?? [];
  const softwareGroups = buildSoftwareGroups(scan);
  const runningCount = software.filter((s) => s.running === true).length;
  /* 分组只收已识别的分类，若总数对不上说明有条目落进了「其他」——卡头要能解释清楚 */
  const groupedCount = softwareGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div>
      <div className="runtime-quote">
        <span className="runtime-quote__icon" aria-hidden="true">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <p className="runtime-quote__text">
          {fitSentence(scan)} <strong>{installedCount} / {groups.length}</strong>{" "}
          项运行环境已就绪
          {software.length > 0 ? (
            <>
              ，另外找到 <strong>{software.length}</strong> 个常用软件
              {runningCount > 0 ? `（${runningCount} 个正在运行）` : ""}。
            </>
          ) : (
            "。"
          )}
        </p>
      </div>

      {/* —— 已安装软件（放前面：这是用户最想看的新内容） —— */}
      <GlassCard
        index={baseIndex}
        title="已安装软件"
        icon={Boxes}
        extra={
          <span className="tiny">
            {software.length > 0
              ? groupedCount === software.length
                ? `${software.length} 个`
                : `已识别 ${groupedCount} / 共 ${software.length} 个`
              : "未检测到"}
          </span>
        }
        className="software-card"
      >
        {software.length === 0 ? (
          <div className="software-empty">
            <span className="software-empty__hand">爱弥斯没找到这些软件呢</span>
            <p className="tiny">没有检测到这类软件</p>
          </div>
        ) : (
          <div className="software-groups">
            {softwareGroups.map((g) => (
              <section className="software-group" key={g.key}>
                <header className="software-group__head">
                  <span className="software-group__title">{g.title}</span>
                  <span className="software-group__count">{g.items.length}</span>
                  {g.items.some((s) => s.running === true) && (
                    <span className="software-group__live">运行中</span>
                  )}
                </header>
                <div className="software-list">
                  {g.items.map((item, idx) => (
                    <div
                      className="software-row"
                      key={`${item.name}-${idx}`}
                      title={item.detail ?? undefined}
                    >
                      {item.running == null ? (
                        <span className="software-row__dot" aria-hidden="true" />
                      ) : (
                        <StatusDot status={item.running ? "pass" : "unknown"} />
                      )}
                      <span className="software-row__name" title={item.name}>
                        {text(item.name)}
                      </span>
                      {item.version?.trim() ? (
                        <span
                          className="software-row__ver"
                          title={item.version}
                        >
                          {item.version}
                        </span>
                      ) : (
                        <span className="software-row__ver software-row__ver--none">
                          —
                        </span>
                      )}
                      <span
                        className="software-row__path"
                        title={
                          [
                            item.source ? `来源：${item.source}` : null,
                            cleanPath(item.path) || item.detail?.trim() || null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                      >
                        {cleanPath(item.path) || item.detail?.trim() || ""}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <p className="software-foot">
          绿点＝后台服务/进程正在运行 · 悬停行可看端口、引擎版本等备注
        </p>
      </GlassCard>

      <h2 className="runtime-section-head">
        <span>运行环境</span>
        <span className="runtime-section-head__count">
          {installedCount} / {groups.length} 组已就绪
        </span>
      </h2>

      <div className="env-groups">
        {groups.map((g, i) => (
          <GlassCard
            key={g.key}
            index={baseIndex + i}
            pad={false}
            className="env-card"
          >
            <div className="env-card__head">
              <StatusDot status={g.status} />
              <h3 className="env-card__title">{g.title}</h3>
              <span className="env-card__summary">{g.summary}</span>
            </div>
            {g.rows.map((row, j) => (
              <div className="env-row" key={`${g.key}-${j}`}>
                <StatusDot status={row.status} />
                <div className="env-row__body">
                  <div className="env-row__name">
                    <span title={row.name}>{row.name}</span>
                    {row.version && <span className="env-row__ver">v{row.version}</span>}
                  </div>
                  {row.path?.trim() ? (
                    <div className="env-row__path" title={row.path}>
                      {row.path}
                    </div>
                  ) : null}
                </div>
                {!row.version && (
                  <span className="env-row__ver">
                    {row.status === "unknown" ? "未检测到" : text(row.version, "—")}
                  </span>
                )}
              </div>
            ))}
          </GlassCard>
        ))}
      </div>

      <p className="env-foot">
        共 {groups.length} 组运行环境 · 已检测到 {installedCount} 组 ·
        PowerShell {text(scan.runtime.powershellVersion, "版本未知")}
      </p>
    </div>
  );
}
