import { openUrl } from "../lib/api";

export interface FooterProps {
  /** 展示版本号（页脚 / 关于面板共用） */
  version: string;
  onAbout: () => void;
}

/** 页脚：制作 清吾 · qingwu.ink ｜ 主题形象 爱弥斯 ｜ vX.Y.Z ｜ 关于 */
export function Footer({ version, onAbout }: FooterProps) {
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
        <span className="app-footer__sep" aria-hidden="true">
          ｜
        </span>
        <button
          type="button"
          className="app-footer__about"
          onClick={onAbout}
          title="关于爱弥斯 · 环境检测"
        >
          关于
        </button>
        <span className="app-footer__line">
          爱弥斯 · 有拿不准的，再扫一次就好 ～
        </span>
      </div>
    </footer>
  );
}
