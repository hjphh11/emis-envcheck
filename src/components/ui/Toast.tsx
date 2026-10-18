import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck, CircleAlert } from "lucide-react";

export interface ToastData {
  id: number;
  message: string;
  tone?: "ok" | "err";
}

export interface ToastHostProps {
  toast: ToastData | null;
  onClose: () => void;
}

/** 底部居中的轻提示，3.2 秒自动消失 */
export function ToastHost({ toast, onClose }: ToastHostProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={[
              "toast",
              toast.tone === "err" ? "toast--err" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            initial={reduced ? false : { opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 460, damping: 30, mass: 0.7 }
            }
          >
            <span className="toast__icon" aria-hidden="true">
              {toast.tone === "err" ? (
                <CircleAlert size={15} strokeWidth={2} />
              ) : (
                <CircleCheck size={15} strokeWidth={2} />
              )}
            </span>
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
