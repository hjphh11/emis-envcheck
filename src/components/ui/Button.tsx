import type {
  ButtonHTMLAttributes,
  ComponentType,
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
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
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
