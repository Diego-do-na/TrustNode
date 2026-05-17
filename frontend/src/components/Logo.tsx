/** TrustNode mark: shield + hub node (trust + network). */
export function LogoMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.75L3.25 3.75v3.75c0 2.85 1.95 4.9 4.75 5.75 2.8-.85 4.75-2.9 4.75-5.75V3.75L8 1.75z"
        stroke="var(--logo-fill)"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="7.25" r="1.35" fill="var(--logo-fill)" />
      <path
        d="M8 5.9V4.5M6.1 8.1l-1-1M9.9 8.1l1-1"
        stroke="var(--logo-fill)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark">
        <LogoMark />
      </div>
      <span className="logo-text">
        Trust<span>Node</span>
      </span>
    </div>
  );
}
