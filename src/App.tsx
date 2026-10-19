import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  Boxes,
  CircleAlert,
  HeartPulse,
  Info,
  ShieldCheck,
} from "lucide-react";
import type { AppInfo, ScanResult } from "./types";
import {
  appInfo as fetchAppInfo,
  relaunchElevated,
  saveTextFile,
  scanAll,
} from "./lib/api";
import { buildHtmlReport, buildJsonReport, reportFileName } from "./lib/report";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import type { TabItem } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import type { ExportKind } from "./components/Toolbar";
import { AdminBanner } from "./components/AdminBanner";
import { Skeleton } from "./components/Skeleton";
import { ErrorCard } from "./components/ErrorCard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Footer } from "./components/Footer";
import { AboutModal } from "./components/AboutModal";
import { ToastHost } from "./components/ui/Toast";
import type { ToastData } from "./components/ui/Toast";
import { Button } from "./components/ui/Button";
import { silhouetteUrl } from "./components/ui/emis";
import { Dashboard } from "./components/pages/Dashboard";
import { Runtime } from "./components/pages/Runtime";
import { Compat } from "./components/pages/Compat";
import { Monitor } from "./components/pages/Monitor";

const TABS: TabItem[] = [
  { key: "dashboard", label: "体检", icon: HeartPulse },
  { key: "runtime", label: "环境", icon: Boxes },
  { key: "compat", label: "兼容", icon: ShieldCheck },
  { key: "monitor", label: "监控", icon: Activity },
];

type TabKey = "dashboard" | "runtime" | "compat" | "monitor";

function isTabKey(v: string): v is TabKey {
  return TABS.some((t) => t.key === v);
}

function hashTab(): TabKey {
  const raw =
    typeof window === "undefined" ? "" : window.location.hash.replace(/^#\/?/, "");
  return isTabKey(raw) ? raw : "dashboard";
}

function errText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default function App() {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<TabKey>(hashTab);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [elevating, setElevating] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const initialized = useRef(false);
  /* 重入保护：Ctrl+R 连按 / ErrorCard 重试 / 工具条按钮可能并发触发扫描 */
  const inFlight = useRef(false);
  /* 只接受最新一次请求的结果：旧请求晚到不能覆盖新结果 */
  const reqId = useRef(0);
  /* Toast id 自增：Date.now() 同毫秒会撞 key，导致动画/关闭互相干扰 */
  const toastSeq = useRef(0);

  const notify = useCallback((message: string, tone: "ok" | "err" = "ok") => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, tone });
  }, []);

  const runScan = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const myReq = reqId.current + 1;
    reqId.current = myReq;
    setScanning(true);
    setError(null);
    try {
      const result = await scanAll();
      if (myReq === reqId.current) setScan(result);
    } catch (err) {
      if (myReq === reqId.current) {
        setError(errText(err) || "采集器没有返回有效数据");
      }
    } finally {
      inFlight.current = false;
      if (myReq === reqId.current) {
        setScanning(false);
        setLoading(false);
      }
    }
  }, []);

  /* 首次进入：扫描 + 取应用信息（StrictMode 下也只跑一次） */
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void runScan();
    let alive = true;
    fetchAppInfo()
      .then((v) => {
        if (alive) setInfo(v);
      })
      .catch(() => {
        /* 版本号拿不到时页脚回落到 1.2.0（见下方 version 兜底） */
      });
    return () => {
      alive = false;
    };
  }, [runScan]);

  /* 用 hash 记页签，方便直接打开 #monitor，也方便截图验收 */
  useEffect(() => {
    const onHash = () => setTab(hashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /* 切到后台时暂停所有持续动画（骨架 shimmer / 呼吸点 / 数值脉冲） */
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle("qhidden", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      root.classList.remove("qhidden");
    };
  }, []);

  const changeTab = useCallback((key: string) => {
    if (!isTabKey(key)) return;
    setTab(key);
    try {
      window.history.replaceState(null, "", `#${key}`);
    } catch {
      /* file:// 等环境忽略 */
    }
  }, []);

  const handleRescan = useCallback(() => {
    void runScan();
  }, [runScan]);

  const handleExport = useCallback(
    async (kind: ExportKind) => {
      if (!scan) {
        notify("还没有可导出的扫描结果", "err");
        return;
      }
      /* 扫描中导出的是上一轮结果，必须说清楚，否则用户会以为导出的是刚采的 */
      if (inFlight.current) {
        notify("正在重新扫描，本次导出的是上一次的结果");
      }
      try {
        const content =
          kind === "html" ? buildHtmlReport(scan, info) : buildJsonReport(scan);
        const path = await saveTextFile({
          defaultName: reportFileName(kind),
          content,
          filterName: kind === "html" ? "HTML 报告" : "JSON 数据",
          extensions: [kind],
        });
        if (path) {
          notify(`报告已导出：${path}`);
        } else {
          notify("已取消导出");
        }
      } catch (err) {
        notify(`导出失败：${errText(err)}`, "err");
      }
    },
    [scan, info, notify],
  );

  const handleElevate = useCallback(async () => {
    setElevating(true);
    try {
      await relaunchElevated();
      notify("正在申请管理员权限，程序会重新启动");
    } catch (err) {
      notify(`提权失败：${errText(err)}`, "err");
    } finally {
      setElevating(false);
    }
  }, [notify]);

  const closeToast = useCallback(() => setToast(null), []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  /* —— 全局快捷键：Ctrl+R 重扫 / Ctrl+E 导出 HTML / Ctrl+1..4 切页签 ——
     输入框内不抢按键；浏览器预览里这些组合也会被 preventDefault。
     关于面板打开时整体让路：Esc 与 Tab 由 Modal 自己处理，快捷键不能穿透到背景。 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (aboutOpen) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === "r") {
        e.preventDefault();
        void runScan();
      } else if (key === "e") {
        e.preventDefault();
        void handleExport("html");
      } else if (key === "1" || key === "2" || key === "3" || key === "4") {
        const targetTab = TABS[Number(key) - 1];
        if (targetTab) {
          e.preventDefault();
          changeTab(targetTab.key);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runScan, handleExport, changeTab, aboutOpen]);

  const showSkeleton = loading && !scan;
  const isAdmin = scan ? scan.meta.isAdmin !== false : true;
  /* 版本号以 app_info()（读 Cargo.toml）为准；浏览器预览 / 调用失败时回落到发布版本 */
  const version = info?.version || "1.3.1";
  /* 采集说明：采集器写的「哪一项为什么没采到」，之前全链路没有出口 */
  const warnings = (scan?.meta.warnings ?? []).filter(
    (w): w is string => typeof w === "string" && w.trim().length > 0,
  );

  return (
    <div className="app">
      {/* 右下角爱弥斯剪影水印：极淡、不挡交互，只做氛围 */}
      <div className="app-emis-bg" aria-hidden="true">
        <img src={silhouetteUrl} alt="" draggable={false} />
      </div>

      <TitleBar />

      <header className="app-header">
        <div className="app-header__inner">
          <TabBar tabs={TABS} active={tab} onChange={changeTab} />
          <Toolbar
            scanning={scanning}
            canExport={Boolean(scan)}
            onRescan={handleRescan}
            onExport={(kind) => void handleExport(kind)}
          />
        </div>
      </header>

      <main className="page-shell">
        {!isAdmin && scan && (
          <AdminBanner
            gains={scan.meta.elevationGains ?? []}
            busy={elevating}
            onElevate={() => void handleElevate()}
          />
        )}

        {/* 采集说明：管理员提示之外的另一层「为什么是未知」，可折叠、不抢视线 */}
        {warnings.length > 0 && (
          <div className="notice notice--info">
            <span className="notice__icon" aria-hidden="true">
              <Info size={15} strokeWidth={2} />
            </span>
            <span className="notice__text">
              <strong>采集说明 {warnings.length} 条</strong> · 部分项目本次没采到，
              报告里的「未知」不代表机器没有
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWarnOpen((v) => !v)}
              aria-expanded={warnOpen}
              title="展开 / 收起采集说明"
            >
              {warnOpen ? "收起" : "查看"}
            </Button>
          </div>
        )}
        {warnings.length > 0 && warnOpen && (
          <ul className="notice-list" aria-label="采集说明">
            {warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        )}

        {error && scan && (
          <div className="error-inline" role="alert">
            <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
            <span>重新扫描没有完成：{error}（下面仍是上一次的结果）</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void runScan()}
              disabled={scanning}
            >
              {scanning ? "重试中…" : "重试"}
            </Button>
            <details className="error-inline__detail">
              <summary>详情</summary>
              <pre>{error}</pre>
            </details>
          </div>
        )}

        {showSkeleton ? (
          <Skeleton />
        ) : !scan ? (
          <ErrorCard
            message={error ?? "采集器没有返回有效数据"}
            onRetry={handleRescan}
          />
        ) : (
          <div style={{ marginTop: !isAdmin ? 18 : 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
                }
              >
                {/* 页签级兜底：单页崩了只替换内容区，标题栏 / 页签栏 / 页脚仍可操作 */}
                <ErrorBoundary
                  key={tab}
                  scope={`「${TABS.find((t) => t.key === tab)?.label ?? tab}」页`}
                >
                  {tab === "dashboard" && (
                    <Dashboard scan={scan} notify={notify} />
                  )}
                  {tab === "runtime" && <Runtime scan={scan} baseIndex={0} />}
                  {tab === "compat" && <Compat scan={scan} baseIndex={0} />}
                  {tab === "monitor" && <Monitor baseIndex={0} />}
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      <Footer version={version} onAbout={() => setAboutOpen(true)} />
      <AboutModal open={aboutOpen} version={version} onClose={closeAbout} />
      <ToastHost toast={toast} onClose={closeToast} />
    </div>
  );
}
