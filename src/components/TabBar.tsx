import type { ComponentType } from "react";
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

/** 四个页签 + 胶囊滑动指示器（motion 的 layoutId 在页签之间共享布局） */
export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const reduced = useReducedMotion();

  return (
    <nav className="tabs" role="tablist" aria-label="功能页签">
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={["tab", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(key)}
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
