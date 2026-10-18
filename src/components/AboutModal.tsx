import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ShieldCheck, X } from "lucide-react";
import { avatarUrl } from "./ui/emis";
import { openUrl } from "../lib/api";
import { Button } from "./ui/Button";

const GITHUB = "https://github.com/hjphh11/emis-envcheck";
const HOMEPAGE = "https://qingwu.ink";

export interface AboutModalProps {
  open: boolean;
  version: string;
  onClose: () => void;
}

/** 轻量「关于」面板：点遮罩 / Esc / 关闭按钮都能退出，焦点锁在面板内 */
export function AboutModal({ open, version, onClose }: AboutModalProps) {
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 80);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = document.querySelector<HTMLElement>(".about-modal");
      if (!panel) return;
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const openLink = (url: string) => {
    void openUrl(url).catch(() => {
      /* 浏览器弹窗被拦也不影响面板 */
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            className="glass-card about-modal"
            onClick={(e) => e.stopPropagation()}
            initial={reduced ? false : { opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 30, mass: 0.8 }
            }
          >
            <button
              ref={closeRef}
              type="button"
              className="about-modal__close"
              onClick={onClose}
              aria-label="关闭关于面板"
              title="关闭（Esc）"
            >
              <X size={16} strokeWidth={2} />
            </button>

            <div className="about-modal__head">
              <img
                className="about-modal__avatar"
                src={avatarUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
              <div className="about-modal__ident">
                <h2 id="about-title" className="about-modal__title">
                  爱弥斯 · 环境检测
                </h2>
                <span className="about-modal__ver">v{version}</span>
              </div>
            </div>

            <dl className="about-modal__list">
              <div className="about-modal__row">
                <dt>制作</dt>
                <dd>
                  <button
                    type="button"
                    className="about-link"
                    onClick={() => openLink(HOMEPAGE)}
                    title="打开 qingwu.ink"
                  >
                    清吾 · qingwu.ink
                    <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                </dd>
              </div>
              <div className="about-modal__row">
                <dt>主题形象</dt>
                <dd>爱弥斯</dd>
              </div>
              <div className="about-modal__row">
                <dt>开源仓库</dt>
                <dd>
                  <button
                    type="button"
                    className="about-link"
                    onClick={() => openLink(GITHUB)}
                    title={GITHUB}
                  >
                    github.com/hjphh11/emis-envcheck
                    <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                </dd>
              </div>
            </dl>

            <p className="about-modal__privacy">
              <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
              本项目数据只在本机处理，不联网上传。
            </p>

            <div className="about-modal__foot">
              <Button variant="ghost" size="sm" onClick={onClose}>
                关闭
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
