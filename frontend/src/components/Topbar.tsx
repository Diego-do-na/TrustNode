interface TopbarProps {
  title: string;
  titleEmphasis: string;
}

export function Topbar({ title, titleEmphasis }: TopbarProps) {
  return (
    <header className="topbar">
      <h1 className="page-title">
        {title} <em>{titleEmphasis}</em>
      </h1>
    </header>
  );
}
