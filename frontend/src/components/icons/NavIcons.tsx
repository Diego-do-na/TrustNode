type IconProps = { className?: string };

export function OverviewIcon({ className = "nav-icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="5" height="5" rx="1.5" />
      <rect x="9" y="1" width="5" height="5" rx="1.5" />
      <rect x="1" y="9" width="5" height="5" rx="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1.5" />
    </svg>
  );
}

export function ReportsIcon({ className = "nav-icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M2 7.5h11M2 3h11M2 12h6.5" />
    </svg>
  );
}

export function DocumentsIcon({ className = "nav-icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3.5 1h6l4 4v8.5a1 1 0 01-1 1h-9a1 1 0 01-1-1V2a1 1 0 011-1z" />
      <path d="M9.5 1v4h4" />
    </svg>
  );
}

export function SettingsIcon({ className = "nav-icon" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="2" />
      <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2" />
    </svg>
  );
}

export function UploadIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5.5 7.5V1M3 3.5L5.5 1 8 3.5M1 9v.5A1 1 0 002 10.5h7A1 1 0 0010 9.5V9" />
    </svg>
  );
}
