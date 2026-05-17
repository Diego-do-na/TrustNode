import { useEffect, useState } from "react";
import {
  generateSummary,
  type AuditResponse,
  type AuditResult,
} from "../api/client";

interface ExecutiveSummaryProps {
  auditResults: AuditResponse[];
  language?: string;
  onSummaryChange?: (summary: string | null) => void;
}

function aggregatePayload(auditResults: AuditResponse[]) {
  const standard_audited = auditResults
    .map((a) => a.standard_audited)
    .join(" + ");

  const totalControls = auditResults.reduce(
    (acc, a) => acc + a.results.length,
    0,
  );
  const weightedScore =
    totalControls === 0
      ? 0
      : auditResults.reduce(
          (acc, a) => acc + a.global_score_percentage * a.results.length,
          0,
        ) / totalControls;

  const results: AuditResult[] = auditResults.flatMap((a) => a.results);

  return {
    standard_audited,
    global_score_percentage: Number(weightedScore.toFixed(1)),
    results,
  };
}

export function ExecutiveSummary({ auditResults, language, onSummaryChange }: ExecutiveSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    setError(null);
    onSummaryChange?.(null);
  }, [language, auditResults, onSummaryChange]);

  const handleGenerate = async () => {
    if (isLoading || auditResults.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = aggregatePayload(auditResults);
      const res = await generateSummary({ ...payload, language });
      setSummary(res.summary);
      onSummaryChange?.(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate summary.");
    } finally {
      setIsLoading(false);
    }
  };

  const paragraphs = summary
    ? summary
        .split(/\n{2,}|\r\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const buttonLabel = summary ? "Regenerate" : "Generate";
  const showButton = !isLoading;

  return (
    <section className="findings-card">
      <div className="card-header">
        <span className="card-title">Executive summary</span>
        {showButton && (
          <button
            type="button"
            onClick={handleGenerate}
            className="btn-ghost btn-sm inline-flex items-center gap-2"
          >
            {buttonLabel}
          </button>
        )}
      </div>

      {!summary && !isLoading && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-400">
            A senior-auditor narrative of your current compliance posture.
          </p>
          {error && <p className="text-sm text-rose-400/90">{error}</p>}
        </div>
      )}

      {isLoading && (
        <div className="space-y-3" aria-live="polite" aria-busy="true">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-300" />
            Analyzing findings…
          </div>
          <div className="space-y-2.5">
            <div className="h-3 w-[92%] animate-pulse rounded-full bg-zinc-800/80" />
            <div className="h-3 w-[88%] animate-pulse rounded-full bg-zinc-800/70" />
            <div className="h-3 w-[95%] animate-pulse rounded-full bg-zinc-800/80" />
            <div className="h-3 w-[60%] animate-pulse rounded-full bg-zinc-800/60" />
          </div>
          <div className="space-y-2.5 pt-2">
            <div className="h-3 w-[90%] animate-pulse rounded-full bg-zinc-800/70" />
            <div className="h-3 w-[78%] animate-pulse rounded-full bg-zinc-800/60" />
            <div className="h-3 w-[84%] animate-pulse rounded-full bg-zinc-800/70" />
          </div>
        </div>
      )}

      {summary && !isLoading && (
        <article className="prose prose-invert max-w-none text-zinc-300">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="text-[15px] leading-7 tracking-[0.005em] text-zinc-300 [&:not(:last-child)]:mb-4"
            >
              {p}
            </p>
          ))}
        </article>
      )}
    </section>
  );
}
