import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "./ui/Button";

export interface AdminBannerProps {
  /** 提权后能多拿到的信息（来自 meta.elevationGains，真实数据可能是很长的句子） */
  gains: string[];
  busy?: boolean;
  onElevate: () => void;
}

/** 从采集器的长句里抽出 2–4 字的关键词，避免把整段说明塞进横幅 */
const GAIN_KEYWORDS = [
  "温度",
  "风扇",
  "SMART",
  "TPM",
  "BitLocker",
  "安全启动",
  "传感器",
  "磁盘",
  "电池",
  "序列号",
];

function shortGain(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  // 取「在句子里最先出现」的关键词（比如「硬盘 SMART 原始属性：温度…」优先 SMART 而不是温度）
  let best: { word: string; at: number } | null = null;
  for (const k of GAIN_KEYWORDS) {
    const at = s.indexOf(k);
    if (at < 0) continue;
    if (!best || at < best.at) best = { word: k, at };
  }
  if (best) return best.word;
  // 没命中关键词就取第一个短句（顿号/斜杠/括号前），再截 6 字
  const head = s.split(/[/／（(·,，:：、]/)[0].trim();
  return (head || s).slice(0, 6);
}

/**
 * 普通权限下的提示条：
 * 主句固定一句短的，提权收益收成小 chip（最多 4 个 + N），全文放 title。
 * 整体锁一行，绝不随 elevationGains 的长度变形。
 */
export function AdminBanner({ gains, busy, onElevate }: AdminBannerProps) {
  const chips: string[] = [];
  for (const g of gains) {
    const c = shortGain(g);
    if (c && !chips.includes(c)) chips.push(c);
  }
  const shown = chips.slice(0, 4);
  const rest = chips.length - shown.length;
  const fullText = gains.map((g) => `· ${g}`).join("\n");

  return (
    <div className="notice" role="status">
      <span className="notice__icon" aria-hidden="true">
        <ShieldAlert size={15} strokeWidth={2} />
      </span>
      <span className="notice__text">
        <strong>未以管理员运行</strong> · 温度与 SMART 明细不可用
      </span>
      {shown.length > 0 && (
        <span className="notice__gains" title={fullText}>
          <span className="notice__gains-label">提权可得</span>
          {shown.map((c) => (
            <span className="notice__chip" key={c}>
              {c}
            </span>
          ))}
          {rest > 0 && (
            <span className="notice__chip notice__chip--more" title={fullText}>
              +{rest}
            </span>
          )}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        icon={ShieldCheck}
        onClick={onElevate}
        disabled={busy}
        title="以管理员身份重启程序，重新采集温度与 SMART 明细"
      >
        {busy ? "重启中…" : "以管理员重启"}
      </Button>
    </div>
  );
}
