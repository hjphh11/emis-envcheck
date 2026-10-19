/**
 * Tauri 调用封装。
 *
 * 同一个界面代码同时跑在两种环境：
 *  - 桌面（Tauri）：走 invoke 调 Rust 命令
 *  - 浏览器（npm run dev 直接开）：走 src/mock/sample.ts 的假数据
 * 这样 UI 可以脱离 Rust 独立开发/截图验收，打包时不用改一行代码。
 */
import type { AppInfo, LiveSnapshot, ScanResult } from "../types";

/** 是否运行在 Tauri 容器里 */
export const hasBackend =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** 全量扫描 */
export async function scanAll(): Promise<ScanResult> {
  if (!hasBackend) {
    const { mockScan } = await import("../mock/sample");
    return mockScan();
  }
  return invokeCmd<ScanResult>("scan_all");
}

/** 实时监控：单次采样 */
export async function liveSnapshot(): Promise<LiveSnapshot> {
  if (!hasBackend) {
    const { mockLive } = await import("../mock/sample");
    return mockLive();
  }
  return invokeCmd<LiveSnapshot>("live_snapshot");
}

/** 应用信息（版本 / 作者 / 构建日期） */
export async function appInfo(): Promise<AppInfo> {
  if (!hasBackend) {
    return {
      name: "爱弥斯 · 环境检测",
      version: "1.2.0",
      author: "清吾",
      homepage: "https://qingwu.ink",
      buildDate: new Date().toISOString(),
    };
  }
  return invokeCmd<AppInfo>("app_info");
}

/** 以管理员身份重启（普通权限下才能调） */
export async function relaunchElevated(): Promise<void> {
  if (!hasBackend) {
    window.alert("浏览器预览模式：这里会以管理员身份重启桌面程序。");
    return;
  }
  return invokeCmd<void>("relaunch_elevated");
}

/** 用系统默认程序打开文件或文件夹 */
export async function openPath(path: string): Promise<void> {
  if (!hasBackend) return;
  await invokeCmd<void>("open_path", { path });
}

/** 打开外部链接 */
export async function openUrl(url: string): Promise<void> {
  if (!hasBackend) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl: open } = await import("@tauri-apps/plugin-opener");
  await open(url);
}

/** 复制到剪贴板 */
export async function copyText(text: string): Promise<void> {
  if (!hasBackend) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
  await writeText(text);
}

export interface SaveOptions {
  /** 默认文件名，如 "清吾环境检测报告-20261018.html" */
  defaultName: string;
  content: string;
  /** 过滤器，如 { name: "HTML 报告", extensions: ["html"] } */
  filterName?: string;
  extensions?: string[];
}

/** 弹保存对话框并写文件；用户取消返回 null */
export async function saveTextFile(opts: SaveOptions): Promise<string | null> {
  const { defaultName, content, filterName = "文本文件", extensions = ["txt"] } = opts;

  if (!hasBackend) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return defaultName;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions }],
  });
  if (!path) return null;
  await invokeCmd<void>("write_text_file", { path, content });
  return path;
}
