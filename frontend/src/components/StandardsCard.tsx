import { STANDARDS } from "../data/mockData";

export function StandardsCard() {
  return (
    <div className="standards-card">
      <div className="card-header">
        <span className="card-title">Active Standards</span>
      </div>
      <div className="standards-grid">
        {STANDARDS.map((std) => (
          <button key={std.id} type="button" className="standard-pill">
            <div className="standard-pill-body">
              <div className="standard-name">
                <span className={`std-dot ${std.level}`} />
                {std.name}
              </div>
              <div className="standard-desc">{std.desc}</div>
            </div>
            <div className={`standard-score ${std.level}`}>{std.score}%</div>
          </button>
        ))}
      </div>
    </div>
  );
}
