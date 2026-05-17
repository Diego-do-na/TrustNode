import { UploadIcon } from "./icons/NavIcons";

interface AnalyseCtaProps {
  onClick: () => void;
}

export function AnalyseCta({ onClick }: AnalyseCtaProps) {
  return (
    <button type="button" className="analyse-cta" onClick={onClick}>
      <span className="analyse-cta-top">
        <span className="analyse-cta-icon" aria-hidden>
          <UploadIcon size={20} />
        </span>
        <span className="analyse-cta-title">Analyse Documents</span>
      </span>
      <span className="analyse-cta-sub">Upload files and run a compliance check</span>
    </button>
  );
}
