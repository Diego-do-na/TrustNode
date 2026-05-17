import { UploadIcon } from "./icons/NavIcons";
import { GlowCard } from "./GlowCard";

interface AnalyseCtaProps {
  onClick: () => void;
}

export function AnalyseCta({ onClick }: AnalyseCtaProps) {
  return (
    <GlowCard
      customSize={true}
      className="w-full p-0 bg-transparent border-0 mb-[22px] print:hidden"
      glowColor="blue"
    >
      <button
        type="button"
        className="analyse-cta"
        onClick={onClick}
        style={{ marginBottom: 0 }}
      >
        <span className="analyse-cta-top">
          <span className="analyse-cta-icon" aria-hidden>
            <UploadIcon size={20} />
          </span>
          <span className="analyse-cta-title">Analyse Documents</span>
        </span>
        <span className="analyse-cta-sub">Upload files and run a compliance check</span>
      </button>
    </GlowCard>
  );
}
