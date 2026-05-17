import { useEffect, useState } from "react";
import type { AuditResponse } from "../api/client";
import { useCountUp } from "../hooks/useCountUp";
import { ScoreRing } from "./ScoreRing";
import { averageTrustScore, scoreLevel } from "../utils/auditMetrics";

interface TrustHeroProps {
  auditResults: AuditResponse[];
}

export function TrustHero({ auditResults }: TrustHeroProps) {
  const hasData = auditResults.length > 0;
  const totalFindings = auditResults.reduce((sum, r) => sum + r.findings.length, 0);
  const score = averageTrustScore(auditResults);
  const displayScore = useCountUp(score);
  const level = score !== null ? scoreLevel(score) : "mid";

  const [barWidth, setBarWidth] = useState("0%");

  useEffect(() => {
    const t = window.setTimeout(() => setBarWidth(score !== null ? `${score}%` : "0%"), 350);
    return () => window.clearTimeout(t);
  }, [score]);

  return (
    <div className="trust-hero">
      <div className="score-label">Trust Score</div>

      <div className="score-ring-wrap">
        {hasData && score !== null && <ScoreRing score={score} />}
        <div className="score-display">
          <span className="score-number">{displayScore !== null ? displayScore : "—"}</span>
          <span className="score-max">/100</span>
        </div>
      </div>

      {hasData ? (
        <div className="score-change">
          Across {auditResults.length} standard{auditResults.length > 1 ? "s" : ""}
        </div>
      ) : (
        <div className="score-change score-change--empty">Run an audit to see your score</div>
      )}

      <div className="score-bar-track">
        <div className={`score-bar-fill score-bar-fill--${level}`} style={{ width: barWidth }} />
      </div>

      {hasData && (
        <div className="trust-efficiency-panel">
          <div className="trust-efficiency-row">
            <span>Manual audit</span>
            <span>~{totalFindings * 2} hours</span>
          </div>
          <div className="trust-efficiency-row">
            <span>TrustNode AI</span>
            <span className="trust-efficiency-highlight">1.2 minutes</span>
          </div>
          <div className="trust-efficiency-divider" />
          <div className="trust-efficiency-row trust-efficiency-row--bold">
            <span>Efficiency gain</span>
            <span className="trust-efficiency-highlight">+99%</span>
          </div>
        </div>
      )}
    </div>
  );
}
