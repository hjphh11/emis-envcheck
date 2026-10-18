import { useEffect, useState } from "react";
import { avatarUrl } from "./ui/emis";

const COPY_LINES = [
  "正在读取你的电脑…",
  "正在读取主板信息…",
  "正在核对运行环境…",
  "正在读取显卡与显示器…",
  "正在检查硬盘健康度…",
  "正在比对升级兼容性…",
];

function Line({ w, mt }: { w: string; mt?: number }) {
  return (
    <div
      className="skel skel-line"
      style={{ width: w, marginTop: mt ?? 0 }}
      aria-hidden="true"
    />
  );
}

/**
 * 首次扫描的品牌化骨架屏：不白屏、有轮播文案、形状与真实布局一致。
 */
export function Skeleton() {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLine((i) => (i + 1) % COPY_LINES.length);
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="skel-shell" aria-busy="true" aria-live="polite">
      <div className="skel-intro">
        <img
          className="skel-intro__avatar"
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <div className="skel-copy skel-swap" key={line}>
          <span className="skel-copy__dot" aria-hidden="true" />
          {COPY_LINES[line]}
        </div>
      </div>

      <div className="score-row">
        <div className="glass-card card-pad skel-card">
          <div className="skel-ring" aria-hidden="true" />
          <Line w="52%" mt={18} />
          <Line w="34%" mt={10} />
          <Line w="70%" mt={16} />
        </div>
        <div className="glass-card card-pad skel-card">
          <Line w="30%" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ marginTop: i === 0 ? 16 : 14 }}>
              <Line w={`${34 + i * 9}%`} />
              <div
                className="skel"
                style={{
                  height: 8,
                  marginTop: 7,
                  width: "100%",
                  borderRadius: 9999,
                }}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="cards-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="glass-card card-pad skel-card">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                className="skel"
                style={{ width: 28, height: 28, borderRadius: 9 }}
                aria-hidden="true"
              />
              <div
                className="skel"
                style={{ width: 72, height: 12, borderRadius: 9999 }}
                aria-hidden="true"
              />
            </div>
            <Line w="88%" mt={18} />
            <Line w="74%" mt={10} />
            <Line w="64%" mt={10} />
          </div>
        ))}
      </div>

      <p className="skel-foot">首次扫描通常需要 3–8 秒，请稍候 ～</p>
    </div>
  );
}
