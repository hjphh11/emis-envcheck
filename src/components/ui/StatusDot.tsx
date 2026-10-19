import type { CheckStatus } from "../../types";
import { STATUS_LABEL } from "./status";

export interface StatusDotProps {
  status: CheckStatus;
  /** 实时采集那种「呼吸」的点 */
  pulse?: boolean;
  className?: string;
  /**
   * 是否由这个点自己承载语义。
   *
   * 默认 false：点只做装饰（aria-hidden），因为几乎所有调用点旁边都有文字
   * （图例的「通过 / 需注意」、监控页的「实时采集中」、计数胶囊里的数字）。
   * 给每个点都加 role="img" + aria-label 会让屏读在体检页连读 20 多次
   * 「通过 通过 通过…」，把真正的内容淹掉。
   *
   * 只有在「点旁边确实没有文字」时才传 true。
   */
  labelled?: boolean;
}

/** 状态点：绿=通过 / 琥珀=注意 / 绯红=不通过 / 暖灰=未知 */
export function StatusDot({ status, pulse, className, labelled }: StatusDotProps) {
  const cls = [
    "dot",
    `dot--${status}`,
    pulse ? "dot--pulse" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (labelled) {
    return (
      <span className={cls} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />
    );
  }
  return <span className={cls} aria-hidden="true" title={STATUS_LABEL[status]} />;
}
