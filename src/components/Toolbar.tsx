import { FileDown, RefreshCw } from "lucide-react";
import { Button } from "./ui/Button";

export type ExportKind = "html" | "json";

export interface ToolbarProps {
  scanning: boolean;
  /** 没有扫描结果时导出按钮禁用 */
  canExport: boolean;
  onRescan: () => void;
  onExport: (kind: ExportKind) => void;
}

/** 顶部工具条：重新扫描 + 导出报告（HTML / JSON） */
export function Toolbar({ scanning, canExport, onRescan, onExport }: ToolbarProps) {
  return (
    <div className="toolbar">
      <Button
        variant="primary"
        icon={RefreshCw}
        iconSpin={scanning}
        onClick={onRescan}
        disabled={scanning}
        title="重新采集一次全部信息"
      >
        {scanning ? "扫描中…" : "重新扫描"}
      </Button>

      <div className="btn-group" role="group" aria-label="导出报告">
        <span className="btn-group__label">
          <FileDown size={13} strokeWidth={2} aria-hidden="true" />
          导出报告
        </span>
        <button
          type="button"
          className="btn"
          disabled={!canExport}
          onClick={() => onExport("html")}
          title="导出自包含 HTML 报告"
        >
          HTML
        </button>
        <button
          type="button"
          className="btn"
          disabled={!canExport}
          onClick={() => onExport("json")}
          title="导出原始 JSON 数据"
        >
          JSON
        </button>
      </div>
    </div>
  );
}
