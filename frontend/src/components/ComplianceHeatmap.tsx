import type { AuditResponse, AuditResult } from "../api/client";
import { STANDARD_DEFINITIONS } from "../data/standards";

interface ComplianceHeatmapProps {
  auditResults: AuditResponse[];
}

type CellStatus = "compliant" | "partial" | "non-compliant";

function toCellStatus(status: AuditResult["status"]): CellStatus {
  if (status === "Compliant") return "compliant";
  if (status === "Partial") return "partial";
  return "non-compliant";
}

function controlTitle(standard: string, controlId: string): string {
  const def = STANDARD_DEFINITIONS[standard];
  return def?.controls.find((c) => c.control_id === controlId)?.title ?? controlId;
}

export function ComplianceHeatmap({ auditResults }: ComplianceHeatmapProps) {
  if (auditResults.length === 0) return null;

  return (
    <section className="heatmap-card">
      <div className="card-header">
        <span className="card-title">Compliance heatmap</span>
        <span className="card-count">{auditResults.length} standards</span>
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-item">
          <span className="heatmap-swatch compliant" /> Compliant
        </span>
        <span className="heatmap-legend-item">
          <span className="heatmap-swatch partial" /> Partial
        </span>
        <span className="heatmap-legend-item">
          <span className="heatmap-swatch non-compliant" /> Non-compliant
        </span>
      </div>

      <div className="heatmap-rows">
        {auditResults.map((result) => {
          const domain = STANDARD_DEFINITIONS[result.standard_audited]?.domain ?? "";
          const cells = result.results;
          const compliantCount = cells.filter((c) => c.status === "Compliant").length;
          const score = Math.round(result.global_score_percentage);

          return (
            <div key={result.standard_audited} className="heatmap-row">
              <div className="heatmap-row-label">
                <span className="heatmap-row-name">{result.standard_audited}</span>
                {domain && <span className="heatmap-row-domain">{domain}</span>}
              </div>

              <div className="heatmap-cells" role="list">
                {cells.map((ctl) => {
                  const tag = toCellStatus(ctl.status);
                  const title = controlTitle(result.standard_audited, ctl.control_id);
                  return (
                    <div
                      key={ctl.control_id}
                      role="listitem"
                      className={`heatmap-cell ${tag}`}
                      title={`${ctl.control_id} · ${title} — ${ctl.status}`}
                    >
                      <span className="heatmap-cell-id">{ctl.control_id}</span>
                    </div>
                  );
                })}
              </div>

              <div className="heatmap-row-summary">
                <span className="heatmap-row-ratio">
                  {compliantCount}/{cells.length}
                </span>
                <span className="heatmap-row-score">{score}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
