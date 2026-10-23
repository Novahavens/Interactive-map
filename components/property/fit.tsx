import type { ClaimNeeds, PropertyDetail } from "@/lib/types";
import { dateShort, money, num, petsAllowed } from "@/lib/utils";

type FitState = "ok" | "warn" | "bad" | "unknown";

export function computeFit(d: PropertyDetail, n: ClaimNeeds): { title: string; state: FitState; text: string }[] {
  // Family fit — beds/baths together, since the claim rarely states one without the other.
  let family: { state: FitState; text: string };
  if (n.bedrooms == null && n.bathrooms == null) {
    family = { state: "unknown", text: "Beds and baths are not on the claim yet." };
  } else if (d.bedrooms == null && d.bathrooms == null) {
    family = { state: "unknown", text: "Beds and baths are not on the record." };
  } else {
    const bedOk = n.bedrooms == null || d.bedrooms == null || Number(d.bedrooms) >= n.bedrooms;
    const bathOk = n.bathrooms == null || d.bathrooms == null || Number(d.bathrooms) >= n.bathrooms;
    if (bedOk && bathOk) {
      family = { state: "ok", text: `${num(d.bedrooms)} bd / ${num(d.bathrooms)} ba meets the claim's ${num(n.bedrooms)} bd / ${num(n.bathrooms)} ba.` };
    } else {
      family = { state: "bad", text: `${num(d.bedrooms)} bd / ${num(d.bathrooms)} ba; the family needs ${num(n.bedrooms)} bd / ${num(n.bathrooms)} ba.` };
    }
  }

  // Pets
  let pets: { state: FitState; text: string };
  if (n.pets == null || n.pets === 0) {
    pets = { state: "unknown", text: "No pets on this claim." };
  } else {
    const allowed = petsAllowed(d.pet_status);
    if (allowed === true) pets = { state: "ok", text: `Pets allowed; the family has ${n.pets}.` };
    else if (allowed === false) pets = { state: "bad", text: `Pets not allowed; the family has ${n.pets}.` };
    else pets = { state: "unknown", text: `Pet policy not stated; the family has ${n.pets}.` };
  }

  // Within FRV
  let budget: { state: FitState; text: string };
  if (d.monthly_rate == null) {
    budget = { state: "unknown", text: "No rent on the record." };
  } else if (n.frv == null) {
    budget = { state: "unknown", text: `${money(d.monthly_rate)}/mo · FRV not on the claim yet.` };
  } else if (Number(d.monthly_rate) <= n.frv) {
    budget = { state: "ok", text: `${money(d.monthly_rate)}/mo is within the FRV of ${money(n.frv)}.` };
  } else {
    budget = { state: "bad", text: `${money(d.monthly_rate)}/mo is above the FRV of ${money(n.frv)}.` };
  }

  // Available by move-in
  let timing: { state: FitState; text: string };
  if (!d.next_availability) {
    timing = { state: "unknown", text: n.moveIn ? `Availability not on the record; move-in is ${dateShort(n.moveIn)}.` : "Availability not on the record." };
  } else if (!n.moveIn) {
    timing = { state: "unknown", text: `Available ${dateShort(d.next_availability)}; move-in date not on the claim.` };
  } else if (d.next_availability <= n.moveIn) {
    timing = { state: "ok", text: `Available ${dateShort(d.next_availability)}, in time for move-in ${dateShort(n.moveIn)}.` };
  } else {
    timing = { state: "bad", text: `Available ${dateShort(d.next_availability)}; the family needs to move in by ${dateShort(n.moveIn)}.` };
  }

  return [
    { title: "Family fit", ...family },
    { title: "Pets", ...pets },
    { title: "Within FRV", ...budget },
    { title: "Available by move-in", ...timing },
  ];
}

const FIT_STYLE: Record<FitState, { glyph: string; bg: string; fg: string; label: string }> = {
  ok: { glyph: "✓", bg: "var(--ok-bg)", fg: "var(--ok-ink)", label: "Meets" },
  warn: { glyph: "!", bg: "var(--amber-bg)", fg: "var(--amber-ink)", label: "Falls short" },
  bad: { glyph: "×", bg: "var(--bad-bg)", fg: "var(--bad-ink)", label: "Does not meet" },
  unknown: { glyph: "?", bg: "var(--surface-muted)", fg: "var(--muted)", label: "Unknown" },
};

export function FitRow({ title, state, text }: { title: string; state: FitState; text: string }) {
  const s = FIT_STYLE[state];
  return (
    <li className="flex items-start gap-2">
      <span
        aria-label={s.label}
        className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
        style={{ background: s.bg, color: s.fg }}
      >
        {s.glyph}
      </span>
      <span className="flex flex-col leading-snug">
        <span className="font-medium">{title}</span>
        <span className="text-[13px] text-muted">{text}</span>
      </span>
    </li>
  );
}
