import { UploadIcon } from "./icons/NavIcons";
import { GlowCard } from "./GlowCard";

interface AnalyzeCtaProps {
  onClick: () => void;
}

export function AnalyzeCta({ onClick }: AnalyzeCtaProps) {
  return (
    <GlowCard
      customSize={true}
      className="analyze-cta-wrap w-full p-0 bg-transparent border-0 mb-[22px] print:hidden"
      glowColor="blue"
    >
      <button
        type="button"
        className="analyze-cta"
        onClick={onClick}
        style={{ marginBottom: 0 }}
      >
        <span className="analyze-cta-top">
          <span className="analyze-cta-icon" aria-hidden>
            <UploadIcon size={20} />
          </span>
          <span className="analyze-cta-title">Analyze Documents</span>
        </span>
        <span className="analyze-cta-sub">Upload files and run a compliance check</span>
      </button>
    </GlowCard>
  );
}
