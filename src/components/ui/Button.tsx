import type {
  ButtonHTMLAttributes,
  ComponentType,
  PointerEvent,
  ReactNode,
} from "react";

type IconType = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

export type ButtonVariant = "primary" | "ghost" | "plain";
export type ButtonSize = "md" | "sm";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconType;
  /** 图标持续旋转（扫描中） */
  iconSpin?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "plain",
  size = "md",
  icon: Icon,
  iconSpin,
  children,
  className,
  type = "button",
  disabled,
  onPointerDown,
  ...rest
}: ButtonProps) {
  /** 点击处扩散一圈轻涟漪：给「按到了」一个物理反馈（纯装饰，拿不到指针位置就跳过） */
  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    if (disabled || e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const sizePx = Math.max(rect.width, rect.height) * 1.2;
    const ripple = document.createElement("span");
    ripple.className = "btn-ripple";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.width = `${sizePx}px`;
    ripple.style.height = `${sizePx}px`;
    ripple.style.left = `${e.clientX - rect.left - sizePx / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - sizePx / 2}px`;
    el.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 620);
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      className={[
        "btn",
        variant !== "plain" ? `btn--${variant}` : "",
        size === "sm" ? "btn--sm" : "",
        !children ? "btn--icon" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {Icon && (
        <span
          className={["btn__icon", iconSpin ? "btn-spin" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        >
          <Icon size={size === "sm" ? 13 : 15} strokeWidth={2} />
        </span>
      )}
      {children}
    </button>
  );
}
