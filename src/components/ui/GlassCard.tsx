import type {
  ComponentType,
  CSSProperties,
  PointerEvent,
  ReactNode,
} from "react";

type IconType = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

export interface GlassCardProps {
  title?: ReactNode;
  icon?: IconType;
  /** 标题行右侧的附加内容（标签 / 计数 / 按钮） */
  extra?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** 卡片进入动效的延迟序号（stagger，每级 40ms） */
  index?: number;
  /** 是否给卡片内边距，默认 true */
  pad?: boolean;
  /** 是否开启「跟随鼠标的柔光 + 抬升 1px」，默认开 */
  glow?: boolean;
  id?: string;
  style?: CSSProperties;
}

const SPOTLIGHT_CLASS = "card-glow";

/** 暖色玻璃卡：全站最基本的容器 */
export function GlassCard({
  title,
  icon: Icon,
  extra,
  children,
  className,
  index,
  pad = true,
  glow = true,
  id,
  style,
}: GlassCardProps) {
  /** 只在鼠标移动时写两个 CSS 变量，合成层做柔光，不触发 React 重渲染 */
  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <section
      id={id}
      className={[
        "glass-card",
        "card-enter",
        glow ? SPOTLIGHT_CLASS : "",
        pad ? "card-pad" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerMove={glow ? handlePointerMove : undefined}
      style={{
        ...(index != null
          ? ({ "--delay": `${index * 40}ms` } as CSSProperties)
          : {}),
        ...style,
      }}
    >
      {(title != null || extra != null) && (
        <header className="card-head">
          {Icon && (
            <span className="card-head__icon" aria-hidden="true">
              <Icon size={15} strokeWidth={2} />
            </span>
          )}
          {title != null && <h2 className="card-head__title">{title}</h2>}
          {extra != null && <span className="card-head__extra">{extra}</span>}
        </header>
      )}
      <div className={title != null || extra != null ? "card-body" : undefined}>
        {children}
      </div>
    </section>
  );
}
