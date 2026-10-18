import {
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import type { CheckStatus, ScanResult } from "../../types";
import { GlassCard } from "../ui/GlassCard";
import { StatusDot } from "../ui/StatusDot";
import { Tag } from "../ui/Tag";
import type { TagTone } from "../ui/Tag";
import { COMPAT_STATUS_LABEL, VERDICT_META } from "../ui/status";
import { text } from "../../lib/format";

const ICON_STYLE: Record<CheckStatus, string> = {
  pass: "var(--color-ok-text)",
  warn: "var(--color-warn-text)",
  fail: "var(--color-fail-text)",
  unknown: "var(--color-unknown-text)",
};

const TAG_TONE: Record<CheckStatus, TagTone> = {
  pass: "ok",
  warn: "warn",
  fail: "fail",
  unknown: "muted",
};

function StatusIcon({ status }: { status: CheckStatus }) {
  const Icon =
    status === "pass"
      ? CircleCheck
      : status === "warn"
        ? TriangleAlert
        : status === "fail"
          ? CircleX
          : CircleQuestionMark;
  return (
    <span className="compat-item__icon" style={{ color: ICON_STYLE[status] }} aria-hidden="true">
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}

export function Compat({
  scan,
  baseIndex = 0,
}: {
  scan: ScanResult;
  baseIndex?: number;
}) {
  const { compat } = scan;
  const meta = VERDICT_META[compat.verdict] ?? VERDICT_META.warn;
  const VerdictIcon =
    compat.verdict === "ok"
      ? ShieldCheck
      : compat.verdict === "warn"
        ? ShieldAlert
        : ShieldX;
  const items = compat.items ?? [];

  return (
    <div>
      <div
        className={`verdict verdict--${meta.tone} card-enter`}
        style={{ animationDelay: `${baseIndex * 45}ms` }}
      >
        <div className="verdict__icon" aria-hidden="true">
          <VerdictIcon size={28} strokeWidth={1.8} />
        </div>
        <div className="verdict__body">
          <p className="verdict__eyebrow">{meta.eyebrow}</p>
          <h2 className="verdict__title">{meta.title}</h2>
          <p className="verdict__sub">{meta.sub}</p>
        </div>
        <div className="verdict__counts">
          <span className="count-pill">
            <StatusDot status="pass" />
            通过 <strong>{compat.passCount ?? 0}</strong>
          </span>
          <span className="count-pill">
            <StatusDot status="warn" />
            风险 <strong>{compat.warnCount ?? 0}</strong>
          </span>
          <span className="count-pill">
            <StatusDot status="fail" />
            不满足 <strong>{compat.failCount ?? 0}</strong>
          </span>
          <span className="count-pill">
            <StatusDot status="unknown" />
            未知 <strong>{compat.unknownCount ?? 0}</strong>
          </span>
        </div>
      </div>

      <GlassCard
        index={baseIndex + 1}
        title="逐项检测"
        icon={ListChecks}
        extra={<span className="tiny">共 {items.length} 项</span>}
        className="compat-card"
      >
        <div className="compat-legend">
          <span className="spark-legend__item">
            <StatusDot status="pass" /> 通过
          </span>
          <span className="spark-legend__item">
            <StatusDot status="warn" /> 需注意
          </span>
          <span className="spark-legend__item">
            <StatusDot status="fail" /> 不通过
          </span>
          <span className="spark-legend__item">
            <StatusDot status="unknown" /> 未知
          </span>
        </div>

        {items.length === 0 ? (
          <p className="tiny" style={{ padding: "8px 4px" }}>
            未检测到兼容性项目。
          </p>
        ) : (
          <>
            <div className="compat-head" aria-hidden="true">
              <span />
              <span>检测项</span>
              <span>实测值</span>
              <span>要求</span>
              <span style={{ justifySelf: "end" }}>结论</span>
            </div>
            {items.map((it) => (
              <div
                key={it.id}
                className={[
                  "compat-item",
                  it.status !== "pass" && it.status !== "unknown"
                    ? `is-${it.status}`
                    : "",
                  it.status === "unknown" ? "is-unknown" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <StatusIcon status={it.status} />
                <span className="compat-item__name">
                  <span className="compat-item__name-main">{text(it.name)}</span>
                  {it.detail?.trim() ? (
                    <span className="compat-item__detail">{it.detail}</span>
                  ) : null}
                </span>
                <span className="compat-item__v" data-k="实测">
                  {text(it.actual)}
                </span>
                <span className="compat-item__v" data-k="要求">
                  {text(it.requirement)}
                </span>
                <span className="compat-item__flag">
                  <Tag tone={TAG_TONE[it.status]}>
                    {COMPAT_STATUS_LABEL[it.status]}
                  </Tag>
                </span>
                {it.reason?.trim() && it.status !== "pass" ? (
                  <div className="compat-item__reason">
                    <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                    <span>{it.reason}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </>
        )}
      </GlassCard>
    </div>
  );
}
