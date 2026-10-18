import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "./ui/Button";

export interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

/** 扫描失败：给出可读原因 + 重试，不留白屏 */
export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <div className="glass-card card-enter error-card" role="alert">
      <div className="error-card__icon" aria-hidden="true">
        <CircleAlert size={26} strokeWidth={1.8} />
      </div>
      <h2 className="error-card__title">扫描没有完成</h2>
      <p className="error-card__text">{message}</p>
      <p className="error-card__hand">呜…这次没读到，再试一次好吗？</p>
      <div className="error-card__actions">
        <Button variant="primary" icon={RefreshCw} onClick={onRetry}>
          重试
        </Button>
      </div>
    </div>
  );
}
