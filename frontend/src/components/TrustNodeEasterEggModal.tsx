import { useCallback, useEffect } from "react";
import { LogoMark } from "./Logo";

interface TrustNodeEasterEggModalProps {
  open: boolean;
  onClose: () => void;
}

export function TrustNodeEasterEggModal({ open, onClose }: TrustNodeEasterEggModalProps) {
  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="easter-egg-modal-bg" onClick={handleBackdrop} role="presentation">
      <div
        className="easter-egg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="easter-egg-title"
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="easter-egg-logo-stage">
          <div className="easter-egg-logo-ring" />
          <div className="easter-egg-logo-mark">
            <LogoMark />
          </div>
          <p id="easter-egg-title" className="easter-egg-wordmark">
            Trust<span>Node</span>
          </p>
        </div>

        <p className="easter-egg-tagline">You found the node. Trust verified.</p>
      </div>
    </div>
  );
}
