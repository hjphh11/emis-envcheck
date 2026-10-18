import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  Boxes,
  CircleAlert,
  HeartPulse,
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
import { Footer } from "./components/Footer";
import { ToastHost } from "./components/ui/Toast";
import type { ToastData } from "./components/ui/Toast";
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
  const initialized = useRef(false);

  const notify = useCallback((message: string, tone: "ok" | "err" = "ok") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await scanAll();
      setScan(result);
    } catch (err) {
      setError(errText(err) || "采集器没有返回有效数据");
    } finally {
      setScanning(false);
      setLoading(false);
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
        /* 版本号拿不到时页脚回落到 1.0.0 */
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

  const showSkeleton = loading && !scan;
  const isAdmin = scan ? scan.meta.isAdmin !== false : true;
  const version = info?.version || "1.0.0";

  return (
    <div className="app">
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

        {error && scan && (
          <div className="error-inline" role="alert">
            <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
            <span>重新扫描没有完成：{error}（下面仍是上一次的结果）</span>
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
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.26, ease: [0.16, 1, 0.3, 1] }
                }
              >
                {tab === "dashboard" && (
                  <Dashboard scan={scan} notify={notify} />
                )}
                {tab === "runtime" && <Runtime scan={scan} baseIndex={0} />}
                {tab === "compat" && <Compat scan={scan} baseIndex={0} />}
                {tab === "monitor" && <Monitor baseIndex={0} />}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      <Footer version={version} />
      <ToastHost toast={toast} onClose={closeToast} />
    </div>
  );
}
