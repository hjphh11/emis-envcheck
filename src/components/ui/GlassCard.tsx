import type {
  ComponentType,
  CSSProperties,
  PointerEvent,
  ReactNode,
} from "react";
import { useEffect, useRef } from "react";

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
  /**
   * 只在鼠标移动时写两个 CSS 变量，合成层做柔光，不触发 React 重渲染。
   *
   * 为什么要 rAF 节流：pointermove 在高刷屏上可达 200+ 次/秒，而每次都要
   * getBoundingClientRect()（会强制同步布局）。页面上有十几张卡时，鼠标一划过
   * 就是成百上千次强制回流，低端机明显掉帧。这里把「读矩形 + 写变量」压到
   * 每帧最多一次；矩形也只在首次进入卡片时读一次（卡片尺寸在悬停期间不会变）。
   */
  const glowRef = useRef<{ el: HTMLElement; rect: DOMRect } | null>(null);
  const rafRef = useRef(0);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  const flush = () => {
    rafRef.current = 0;
    const cached = glowRef.current;
    const pos = pendingRef.current;
    if (!cached || !pos) return;
    cached.el.style.setProperty("--mx", `${pos.x}px`);
    cached.el.style.setProperty("--my", `${pos.y}px`);
  };

  const handlePointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    if (glowRef.current?.el !== el) {
      glowRef.current = { el, rect: el.getBoundingClientRect() };
    }
    pendingRef.current = {
      x: e.clientX - glowRef.current.rect.left,
      y: e.clientY - glowRef.current.rect.top,
    };
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(flush);
    }
  };

  const handlePointerLeave = () => {
    glowRef.current = null;
    pendingRef.current = null;
  };

  /* 卸载时取消挂起的帧，避免对已移除的节点写样式 */
  useEffect(() => () => {
    if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
  }, []);

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
      onPointerLeave={glow ? handlePointerLeave : undefined}
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
