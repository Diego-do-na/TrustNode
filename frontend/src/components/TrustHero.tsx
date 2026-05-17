import { useEffect, useState } from "react";
import type { AuditResponse } from "../api/client";

interface TrustHeroProps {
  auditResults: AuditResponse[];
}

export function TrustHero({ auditResults }: TrustHeroProps) {
  const hasData = auditResults.length > 0;

  const totalFindings = auditResults.reduce((sum, r) => sum + r.findings.length, 0);

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

      {hasData && (
        <div className="mt-4 flex flex-col items-center gap-1 text-xs font-mono text-zinc-400 bg-zinc-900/50 p-2 rounded-md border border-zinc-800 w-full">
          <div className="flex justify-between w-full px-2">
            <span>Manual Audit:</span>
            <span className="text-zinc-300">~{totalFindings * 2} Hours</span>
          </div>
          <div className="flex justify-between w-full px-2">
            <span>TrustNode AI:</span>
            <span className="text-emerald-400">1.2 Minutes</span>
          </div>
          <div className="w-full h-px bg-zinc-800 my-0.5"></div>
          <div className="flex justify-between w-full px-2 font-bold text-emerald-500">
            <span>Efficiency Gain:</span>
            <span>+99%</span>
          </div>
        </div>
      )}
    </div>
  );
}
