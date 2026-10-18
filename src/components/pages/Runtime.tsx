import { Sparkles } from "lucide-react";
import type { CheckStatus, ScanResult } from "../../types";
import { text } from "../../lib/format";
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

/** 一句手写体：这台机器适合跑什么 */
function fitSentence(scan: ScanResult): string {
  const memGB = scan.memory.totalBytes / 1024 ** 3;
  const hasDiscrete = scan.gpus.some((g) => g.discrete === true);
  const rt = scan.runtime;
  const hasFw = rt.dotnetFramework.some((d) => d.installed);
  const hasWebview = rt.webview2.installed === true;
  const hasDev = Boolean(rt.node || rt.python || rt.git);

  const items: string[] = ["日常办公与网页浏览"];
  if (memGB >= 16) items.push("多任务与轻度创作");
  if (hasDev) items.push("本地开发与脚本自动化");
  else if (hasFw || hasWebview) items.push("常见 Windows 桌面软件");
  if (hasDiscrete && memGB >= 16) items.push("主流 3A 游戏");
  if (hasDiscrete && memGB >= 8) items.push("视频剪辑与 GPU 加速");

  return `这台机器适合跑：${items.slice(0, 5).join("、")}。`;
}

function buildGroups(scan: ScanResult): EnvGroup[] {
  const rt = scan.runtime;
  const groups: EnvGroup[] = [];

  /* .NET Framework */
  const fw = rt.dotnetFramework.filter((d) => d.installed);
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
    summary: rt.dotnetRuntimes.length ? `${rt.dotnetRuntimes.length} 个运行时` : "未检测到",
    status: rt.dotnetRuntimes.length ? "pass" : "unknown",
    rows: rt.dotnetRuntimes.length
      ? rt.dotnetRuntimes.map((d) => ({
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
    summary: rt.vcpp.length ? `${rt.vcpp.length} 个版本` : "缺失",
    status: rt.vcpp.length ? "pass" : "fail",
    rows: rt.vcpp.length
      ? rt.vcpp.map((v) => ({
          name: `Visual C++ ${v.year}`,
          version: v.version,
          path: v.arch,
          status: "pass" as const,
        }))
      : [{ name: "Visual C++ 运行库", version: null, path: "未安装", status: "fail" as const }],
  });

  /* DirectX */
  const dx = rt.directx;
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
        path: [dx.d3d12 ? "D3D12 可用" : null, dx.wddm ? `WDDM ${dx.wddm}` : null]
          .filter(Boolean)
          .join(" · ") || "未提供",
        status: dxStatus,
      },
    ],
  });

  /* WebView2 */
  const wv = rt.webview2;
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
    summary: rt.java.length ? `${rt.java.length} 个` : "未检测到",
    status: rt.java.length ? "pass" : "unknown",
    rows: rt.java.length
      ? rt.java.map((j) => ({
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
  const wsl = rt.wsl;
  const wslStatus: CheckStatus =
    wsl.installed == null ? "unknown" : wsl.installed ? "pass" : "unknown";
  groups.push({
    key: "wsl",
    title: "WSL",
    summary: wslStatus === "pass" ? `${wsl.distros.length} 个发行版` : "未安装",
    status: wslStatus,
    rows: [
      {
        name: "Windows Subsystem for Linux",
        version: wsl.version,
        path: wsl.distros.length ? wsl.distros.join(" / ") : "未安装发行版",
        status: wslStatus,
      },
    ],
  });

  return groups;
}

export function Runtime({ scan, baseIndex = 0 }: { scan: ScanResult; baseIndex?: number }) {
  const groups = buildGroups(scan);
  const installedCount = groups.filter((g) => g.status === "pass").length;

  return (
    <div>
      <div className="runtime-quote">
        <span className="runtime-quote__icon" aria-hidden="true">
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <p className="runtime-quote__text">
          {fitSentence(scan)} <strong>{installedCount} / {groups.length}</strong>{" "}
          项运行环境已就绪。
        </p>
      </div>

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
