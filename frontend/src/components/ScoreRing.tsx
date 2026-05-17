import { scoreLevel } from "../utils/auditMetrics";

interface ScoreRingProps {
  score: number;
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({ score }: ScoreRingProps) {
  const level = scoreLevel(score);
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

  return (
    <svg className="score-ring" viewBox="0 0 120 120" aria-hidden>
      <circle className="score-ring-track" cx="60" cy="60" r={RADIUS} />
      <circle
        className={`score-ring-fill score-ring-fill--${level}`}
        cx="60"
        cy="60"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
