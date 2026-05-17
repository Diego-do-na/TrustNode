import { useEffect, useState } from "react";
import type { AuditResponse } from "../api/client";

interface TrustHeroProps {
  auditResults: AuditResponse[];
}

export function TrustHero({ auditResults }: TrustHeroProps) {
  const hasData = auditResults.length > 0;

  const score = hasData
    ? Math.round(
        auditResults.reduce((sum, r) => sum + r.global_score_percentage, 0) /
          auditResults.length,
      )
    : null;

  const [barWidth, setBarWidth] = useState("0%");

  useEffect(() => {
    const t = window.setTimeout(() => setBarWidth(score !== null ? `${score}%` : "0%"), 350);
    return () => window.clearTimeout(t);
  }, [score]);

  return (
    <div className="trust-hero">
      <div className="score-label">Trust Score</div>
      <div>
        <span className="score-number">{score !== null ? score : "—"}</span>
        <span className="score-max">/100</span>
      </div>
      {hasData ? (
        <div className="score-change">
          Across {auditResults.length} standard{auditResults.length > 1 ? "s" : ""}
        </div>
      ) : (
        <div className="score-change score-change--empty">Run an audit to see your score</div>
      )}
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: barWidth }} />
      </div>
    </div>
  );
}
