import { useEffect, useState } from "react";
import { SCORE_CHANGE, TRUST_SCORE } from "../data/mockData";

export function TrustHero() {
  const [barWidth, setBarWidth] = useState("0%");

  useEffect(() => {
    const t = window.setTimeout(() => setBarWidth(`${TRUST_SCORE}%`), 350);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="trust-hero">
      <div className="score-label">Trust Score</div>
      <div>
        <span className="score-number">{TRUST_SCORE}</span>
        <span className="score-max">/100</span>
      </div>
      <div className="score-change">↑ +{SCORE_CHANGE} pts this month</div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: barWidth }} />
      </div>
    </div>
  );
}
