import { Bath, BedDouble, DollarSign, PawPrint } from "lucide-react";
import type { PropertyDetail } from "@/lib/types";
import { money, num, petsAllowed } from "@/lib/utils";

/** The four things a searcher checks first: beds, baths, rent, pets. Sits above everything else in the panel. */
export default function KeyFacts({ detail }: { detail: PropertyDetail }) {
  const pets = petsAllowed(detail.pet_status);
  const petTone = pets === true ? "ok" : pets === false ? "bad" : "muted";
  return (
    <div className="grid grid-cols-4 gap-1.5 border-b border-line px-4 py-3" aria-label="Key facts">
      <Fact icon={<BedDouble className="h-3.5 w-3.5" aria-hidden="true" />} label="Beds" value={num(detail.bedrooms)} />
      <Fact icon={<Bath className="h-3.5 w-3.5" aria-hidden="true" />} label="Baths" value={num(detail.bathrooms)} />
      <Fact icon={<DollarSign className="h-3.5 w-3.5" aria-hidden="true" />} label="Rent / mo" value={money(detail.monthly_rate)} />
      <Fact icon={<PawPrint className="h-3.5 w-3.5" aria-hidden="true" />} label="Pets" value={pets === null ? "—" : pets ? "Yes" : "No"} tone={petTone} />
    </div>
  );
}

function Fact({ icon, label, value, tone = "plain" }: { icon: React.ReactNode; label: string; value: string; tone?: "plain" | "ok" | "bad" | "muted" }) {
  const style =
    tone === "ok"
      ? { background: "var(--ok-bg)", color: "var(--ok-ink)", borderColor: "var(--ok-line)" }
      : tone === "bad"
        ? { background: "var(--bad-bg)", color: "var(--bad-ink)", borderColor: "var(--bad-line)" }
        : { background: "var(--surface-muted)", color: value === "—" ? "var(--muted)" : "var(--ink)", borderColor: "var(--line)" };
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center" style={style}>
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        {icon}
        {label}
      </span>
      <span className="truncate font-mono text-[15px] font-semibold leading-tight">{value}</span>
    </div>
  );
}
