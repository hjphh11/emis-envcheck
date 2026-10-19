import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { CircleAlert, Copy, RefreshCw } from "lucide-react";
import { copyText } from "../lib/api";
import { Button } from "./ui/Button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 出错区域的名字，进标题与复制内容，便于用户说清「哪一块崩了」 */
  scope?: string;
  /** 自定义兜底（默认用 ErrorCard 风格的卡片） */
  fallback?: (info: { error: Error; reset: () => void }) => ReactNode;
  /** 重置时是否整页刷新（顶层边界用 true，页签级用 false 只重挂子树） */
  reloadOnReset?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 渲染异常兜底。
 *
 * 为什么必须有：React 19 里未捕获的渲染异常会让整棵树卸载 → 用户看到纯白窗口，
 * 连「重新扫描」都点不到。顶层包一层（整窗兜底）+ 页签内容再包一层（单页崩不拖垮页签栏）。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* 绿色版没有远程日志，至少留在控制台，方便用户截图反馈 */
    console.error("[ErrorBoundary]", this.props.scope ?? "app", error, info.componentStack);
  }

  private reset = () => {
    if (this.props.reloadOnReset) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  private copyDetail = () => {
    const { error } = this.state;
    if (!error) return;
    const detail = [
      `区域：${this.props.scope ?? "应用"}`,
      `错误：${error.name}: ${error.message}`,
      error.stack ?? "",
    ].join("\n");
    void copyText(detail).catch(() => {
      /* 剪贴板不可用时不打扰用户，详情本身已显示在页面上 */
    });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }

    const scope = this.props.scope ?? "应用";
    return (
      <div className="error-card glass-card card-enter" role="alert">
        <div className="error-card__icon" aria-hidden="true">
          <CircleAlert size={26} strokeWidth={1.8} />
        </div>
        <h2 className="error-card__title">界面出了点问题</h2>
        <p className="error-card__text">
          {scope}渲染时抛了异常：{error.message || error.name}
          <br />
          其它部分仍然可用，可以先重试，或把详情复制给开发者。
        </p>
        <details className="error-inline" style={{ width: "100%", textAlign: "left" }}>
          <summary style={{ cursor: "pointer" }}>详情</summary>
          <pre
            className="mono"
            style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {error.stack ?? `${error.name}: ${error.message}`}
          </pre>
        </details>
        <div className="error-card__actions">
          <Button variant="primary" icon={RefreshCw} onClick={this.reset}>
            {this.props.reloadOnReset ? "重新加载" : "重试"}
          </Button>
          <Button variant="ghost" icon={Copy} onClick={this.copyDetail}>
            复制错误详情
          </Button>
        </div>
      </div>
    );
  }
}
