import type { ComponentType, CSSProperties, ReactNode } from "react";

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
  /** 卡片进入动效的延迟序号（stagger） */
  index?: number;
  /** 是否给卡片内边距，默认 true */
  pad?: boolean;
  id?: string;
  style?: CSSProperties;
}

/** 暖色玻璃卡：全站最基本的容器 */
export function GlassCard({
  title,
  icon: Icon,
  extra,
  children,
  className,
  index,
  pad = true,
  id,
  style,
}: GlassCardProps) {
  return (
    <section
      id={id}
      className={[
        "glass-card",
        "card-enter",
        pad ? "card-pad" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...(index != null ? { animationDelay: `${index * 45}ms` } : {}),
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
