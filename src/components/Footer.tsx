import { openUrl } from "../lib/api";

export interface FooterProps {
  /** 版本号来自 appInfo；还没拿到时先用 1.0.0 */
  version: string;
}

/** 页脚：制作 清吾 · qingwu.ink ｜ 主题形象 爱弥斯 ｜ vX.Y.Z */
export function Footer({ version }: FooterProps) {
  const openHome = () => {
    void openUrl("https://qingwu.ink").catch(() => {
      /* 浏览器预览下 window.open 被拦截也不影响界面 */
    });
  };

  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <span>
          <span className="app-footer__hand">制作 清吾</span>
          <span className="app-footer__sep"> · </span>
          <a
            href="https://qingwu.ink"
            onClick={(e) => {
              e.preventDefault();
              openHome();
            }}
          >
            qingwu.ink
          </a>
        </span>
        <span className="app-footer__sep" aria-hidden="true">
          ｜
        </span>
        <span>主题形象 爱弥斯</span>
        <span className="app-footer__sep" aria-hidden="true">
          ｜
        </span>
        <span>v{version}</span>
      </div>
    </footer>
  );
}
