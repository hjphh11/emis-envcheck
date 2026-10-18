/**
 * 少量通用 hooks。
 * 动效全部尊重 prefers-reduced-motion（用 motion 的 useReducedMotion）。
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * 数字滚动：从 0 缓动到 target。
 * 降低动效时直接落到目标值。
 */
export function useCountUp(target: number, duration = 1100): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // fromRef 不参与依赖：它只作为「上一轮落点」被读取
  }, [target, duration, reduced]);

  return value;
}

/** 页面可见性：document.hidden 时返回 true（用于暂停轮询） */
export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() =>
    typeof document === "undefined" ? false : document.hidden,
  );
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}
