import { TrustHero } from "../components/TrustHero";
import { StandardsCard } from "../components/StandardsCard";
import { FindingsCard } from "../components/FindingsCard";

export function OverviewPage() {
  return (
    <>
      <div className="hero-row">
        <TrustHero />
        <StandardsCard />
      </div>
      <FindingsCard />
    </>
  );
}
