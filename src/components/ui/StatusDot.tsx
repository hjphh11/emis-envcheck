import type { CheckStatus } from "../../types";
import { STATUS_LABEL } from "./status";

export interface StatusDotProps {
  status: CheckStatus;
  /** 实时采集那种「呼吸」的点 */
  pulse?: boolean;
  className?: string;
}

/** 状态点：绿=通过 / 琥珀=注意 / 绯红=不通过 / 暖灰=未知 */
export function StatusDot({ status, pulse, className }: StatusDotProps) {
  return (
    <span
      className={[
        "dot",
        `dot--${status}`,
        pulse ? "dot--pulse" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
    />
  );
}
