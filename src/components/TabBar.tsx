import { useRef } from "react";
import type { ComponentType, KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";

type IconType = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

export interface TabItem {
  key: string;
  label: string;
  icon: IconType;
}

export interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

/**
 * 四个页签 + 胶囊滑动指示器（motion 的 layoutId 在页签之间共享布局）。
 * 键盘：←/→（或 ↑/↓）循环切换，Home/End 跳首尾，焦点跟随选中项。
 */
export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const reduced = useReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAndFocus = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      selectAndFocus(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      selectAndFocus(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectAndFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectAndFocus(tabs.length - 1);
    }
  };

  return (
    <nav className="tabs" role="tablist" aria-label="功能页签">
      {tabs.map(({ key, label, icon: Icon }, index) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`tab-${key}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${key}`}
            tabIndex={isActive ? 0 : -1}
            title={`${label} (Ctrl+${index + 1})`}
            className={["tab", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(key)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {isActive && (
              <motion.span
                layoutId="tab-pill"
                className="tab__pill"
                aria-hidden="true"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 42 }
                }
              />
            )}
            <span className="tab__icon" aria-hidden="true">
              <Icon size={14} strokeWidth={2} />
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
