import { LogoMark } from "./Logo";

interface OverviewEmptyStateProps {
  onStartAudit: () => void;
}

const STEPS = [
  { n: "1", title: "Upload", desc: "Add PDFs from your compliance library" },
  { n: "2", title: "Select standards", desc: "Pick ISO and custom frameworks to assess" },
  { n: "3", title: "Review score", desc: "See trust score, gaps, and evidence here" },
];

export function OverviewEmptyState({ onStartAudit }: OverviewEmptyStateProps) {
  return (
    <section className="overview-empty">
      <div className="overview-empty-mark">
        <LogoMark />
      </div>
      <h2 className="overview-empty-title">Your compliance command center</h2>
      <p className="overview-empty-sub">
        Run your first analysis to unlock trust scoring, standard breakdowns, and actionable findings.
      </p>

      <ol className="overview-empty-steps">
        {STEPS.map((step) => (
          <li key={step.n} className="overview-empty-step">
            <span className="overview-empty-step-num">{step.n}</span>
            <div>
              <span className="overview-empty-step-title">{step.title}</span>
              <span className="overview-empty-step-desc">{step.desc}</span>
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className="btn btn-primary overview-empty-cta" onClick={onStartAudit}>
        Analyze documents
      </button>
    </section>
  );
}
