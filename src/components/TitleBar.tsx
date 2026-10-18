import { Minus, Square, X } from "lucide-react";
import { hasBackend } from "../lib/api";

/** 只声明用到的窗口能力，避免静态 import Tauri（浏览器预览时不能崩） */
interface WinApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * 只对三个窗口按钮做动态 import + try/catch：
 * 浏览器预览里 hasBackend=false，直接短路，不碰任何 Tauri 模块，控制台零报错。
 */
async function withWindow(action: (win: WinApi) => Promise<unknown>): Promise<void> {
  if (!hasBackend) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await action(getCurrentWindow() as unknown as WinApi);
  } catch {
    /* 提权/权限配置不完整时也不要把界面弄崩 */
  }
}

export function TitleBar({ title = "爱弥斯 · 环境检测" }: { title?: string }) {
  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span className="logo-mark" aria-hidden="true" />
        <span className="titlebar__title">{title}</span>
      </div>

      {/* 中间整段是窗口拖拽区（无边框窗口靠它移动） */}
      <div
        className="titlebar__drag"
        data-tauri-drag-region=""
        onDoubleClick={() => {
          void withWindow((w) => w.toggleMaximize());
        }}
      />

      <div className="win-controls">
        <button
          type="button"
          className="win-btn"
          title="最小化"
          aria-label="最小化"
          onClick={() => void withWindow((w) => w.minimize())}
        >
          <Minus size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="win-btn"
          title="最大化 / 还原"
          aria-label="最大化或还原窗口"
          onClick={() => void withWindow((w) => w.toggleMaximize())}
        >
          <Square size={12.5} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="win-btn win-btn--close"
          title="关闭"
          aria-label="关闭窗口"
          onClick={() => void withWindow((w) => w.close())}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
