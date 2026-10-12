"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Check, ExternalLink, Images, Phone, Mail, Loader2, Ban, Sparkles } from "lucide-react";
import type { PropertyDetail, ClaimNeeds, ApiError } from "@/lib/types";
import { classifyGroup } from "@/lib/types";
import { cn, money, num, dateShort, miles, yesNo } from "@/lib/utils";

interface Props {
  propertyId: string;
  distanceMiles: number | null;
  needs: ClaimNeeds | null;
  claimId: string | null;
  claimName: string | null;
  attached: boolean;
  onAttached: (propertyId: string, subitemId: string) => void;
  onClose: () => void;
}

type AddState = { kind: "idle" } | { kind: "adding" } | { kind: "done"; subitemId: string } | { kind: "error"; message: string };
type FitState = "ok" | "warn" | "bad" | "unknown";

const GROUP_LABEL: Record<ReturnType<typeof classifyGroup>, string> = {
  database: "Data Base",
  preferred: "Preferred Landlord",
  dnu: "DO NOT USE",
  unknown: "Unknown group",
};

// One colour language for the group badge: ok/amber/bad/neutral tokens, same as the Fit rows.
const GROUP_TOKEN: Record<ReturnType<typeof classifyGroup>, { bg: string; ink: string; line: string; dot: string }> = {
  database: { bg: "var(--ok-bg)", ink: "var(--ok-ink)", line: "var(--ok-line)", dot: "#17c964" },
  preferred: { bg: "var(--surface-muted)", ink: "var(--ink)", line: "var(--line2)", dot: "#7928ca" },
  dnu: { bg: "var(--bad-bg)", ink: "var(--bad-ink)", line: "var(--bad-line)", dot: "#ee0000" },
  unknown: { bg: "var(--surface-muted)", ink: "var(--muted)", line: "var(--line)", dot: "#8f8f8f" },
};

export default function PropertyPanel({ propertyId, distanceMiles, needs, claimId, claimName, attached, onAttached, onClose }: Props) {
  // The panel is keyed by claim + property, so a claim switch unmounts it; this stops a late
  // add response from reporting into the next claim's state.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState<AddState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setAdd({ kind: "idle" });
    (async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}`, { cache: "no-store" });
        const json = (await res.json()) as PropertyDetail | ApiError;
        if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
        if (!cancelled) setDetail(json as PropertyDetail);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this property");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const group = classifyGroup(detail?.group_title);
  const groupToken = GROUP_TOKEN[group];
  const fitRows = detail && needs ? computeFit(detail, needs) : [];

  async function handleAdd() {
    if (!claimId || !detail) return;
    setAdd({ kind: "adding" });
    try {
      const res = await fetch("/api/claim/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, propertyId }),
      });
      const json = (await res.json()) as { ok: true; subitemId: string; alreadyAttached: boolean } | ApiError;
      if (!res.ok || !("ok" in json)) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
      if (!alive.current) return;
      setAdd({ kind: "done", subitemId: json.subitemId });
      onAttached(propertyId, json.subitemId);
    } catch (e) {
      if (!alive.current) return;
      setAdd({ kind: "error", message: e instanceof Error ? e.message : "Add to claim failed" });
    }
  }

  const isAttached = attached || add.kind === "done";
  const addDisabledReason = !claimId
    ? "Pick a claim from Claims (Ctrl/⌘ K) to attach properties"
    : group === "dnu"
      ? "DO NOT USE properties cannot be attached"
      : isAttached
        ? "Already on this claim"
        : null;

  return (
    <aside
      className="flex h-full w-full flex-col border-line bg-surface text-ink shadow-2xl sm:w-[400px] sm:border-l"
      aria-label="Property details"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0 flex-1">
          {detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium"
                  style={{ background: groupToken.bg, color: groupToken.ink, border: `1px solid ${groupToken.line}` }}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: groupToken.dot }} />
                  {GROUP_LABEL[group]}
                </span>
                {distanceMiles != null && <span className="text-[13px] text-muted">{miles(distanceMiles)} from the loss</span>}
              </div>
              <h2 className="mt-1.5 truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">{detail.name ?? "Property"}</h2>
              <p className="truncate text-[13px] text-muted">
                {detail.address ?? [detail.city, detail.state, detail.zipcode].filter(Boolean).join(", ")}
              </p>
            </>
          ) : (
            <div className="nh-skeleton h-12" />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted hover:text-ink"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      <div className="nh-scroll min-h-0 flex-1 overflow-y-auto text-sm">
        {error && (
          <div className="m-4 rounded-md border p-3" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
            <div className="font-medium">Couldn&apos;t load this property</div>
            <div className="text-xs">{error}</div>
          </div>
        )}
        {!detail && !error && (
          <div className="space-y-2 p-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="nh-skeleton h-5" />
            ))}
          </div>
        )}

        {detail && (
          <>
            {/* Fit against the claim */}
            {needs && (
              <Section title="Fit against this claim">
                <ul className="flex flex-col gap-1.5">
                  {fitRows.map((row) => (
                    <FitRow key={row.title} {...row} />
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  Unknowns are gaps on the claim or the record, not judgements.{" "}
                  <a
                    href={`https://novahavens.monday.com/boards/9030696652/pulses/${claimId ?? ""}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium no-underline"
                  >
                    Fill them on Monday →
                  </a>
                </p>
              </Section>
            )}

            {/* Phase 2 slot: AI summary */}
            <div className="border-b border-line px-4 py-2.5">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-line2 px-2.5 py-2 text-muted">
                <span className="inline-flex items-center gap-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>One-line summary of this option for the adjuster</span>
                </span>
                <span className="shrink-0 rounded border border-line px-1.5 py-px text-[10px] font-medium tracking-wide">PHASE 2</span>
              </div>
            </div>

            {/* Cost to place */}
            <Section title="Cost to place">
              <div className="flex flex-col gap-1 text-[13px]">
                <Fee label="Monthly rent" value={money(detail.monthly_rate)} strong />
                <Fee label="Security deposit" value={money(detail.security_deposit)} />
                <Fee label="Pet deposit" value={money(detail.pet_deposit)} />
                <Fee label="Pet fee (one-off)" value={money(detail.pet_fee)} />
                <Fee label="Cleaning fee" value={money(detail.cleaning_fee)} />
                <Fee label="Admin fee" value={money(detail.admin_fee)} />
                <Fee label="Application fee" value={money(detail.application_fee)} />
                <Fee label="Move-in fee" value={money(detail.move_in_fee)} />
                {detail.other_fee_1 != null && <Fee label={detail.other_fee_1_desc || "Other fee"} value={money(detail.other_fee_1)} />}
                {detail.other_fee_2 != null && <Fee label={detail.other_fee_2_desc || "Other fee"} value={money(detail.other_fee_2)} />}
                <Fee
                  label="Pet rent (recurring, excluded)"
                  value={detail.pet_rent != null ? `${money(detail.pet_rent)}/mo` : "—"}
                />
                <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2.5">
                  <span className="font-medium">Move-in total</span>
                  <span className="font-mono text-xl font-semibold">{money(detail.move_in_total)}</span>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted">Rent + deposits + one-off fees. Recurring pet rent is excluded and shown separately when present.</p>
              {detail.ntv != null && (
                <p className="mt-1 text-xs text-muted">
                  NTV <span className="font-mono">{money(detail.ntv)}</span>
                </p>
              )}
            </Section>

            {/* Property */}
            <Section title="Property">
              <div className="grid grid-cols-4 gap-2">
                <Tile label="Beds" value={num(detail.bedrooms)} />
                <Tile label="Baths" value={num(detail.bathrooms)} />
                <Tile label="Pets" value={yesNo(detail.pet_status)} />
                <Tile label="Sq ft" value={num(detail.sqft)} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 text-[13px]">
                <Row k="Type" v={detail.property_type && detail.property_type !== "N/D" ? detail.property_type : "—"} />
                <Row k="Furnished" v={yesNo(detail.furnished)} />
                <Row k="Fenced yard" v={yesNo(detail.fenced_yard)} />
                <Row k="Available" v={dateShort(detail.next_availability)} />
              </div>
            </Section>

            {/* Contacts */}
            <Section title="Contacts">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs text-muted">Owner</span>
                    <span className="font-medium">{detail.owner_name ?? "—"}</span>
                  </span>
                  {detail.owner_phone && (
                    <a
                      href={`tel:${detail.owner_phone.replace(/[^+\d]/g, "")}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 font-mono text-[13px] text-ink no-underline"
                    >
                      <Phone className="h-3 w-3" />
                      {detail.owner_phone}
                    </a>
                  )}
                </div>
                {detail.owner_email && (
                  <a href={`mailto:${detail.owner_email}`} className="flex items-center gap-2 text-brand text-[13px] no-underline hover:underline">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{detail.owner_email}</span>
                  </a>
                )}
                {detail.last_contact && <p className="text-xs text-muted">Last contact {dateShort(detail.last_contact)}</p>}

                <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs text-muted">Landlord / PM</span>
                    <span className={detail.landlord_name ? "font-medium" : "text-muted"}>
                      {detail.landlord_name ?? "None linked to this property"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-xs text-muted">
                    {detail.landlord_approval ? detail.landlord_approval : "approval unknown"}
                  </span>
                </div>
                {detail.landlord_phone && (
                  <a
                    href={`tel:${detail.landlord_phone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-line px-3 font-mono text-[13px] text-ink no-underline"
                  >
                    <Phone className="h-3 w-3" />
                    {detail.landlord_phone}
                  </a>
                )}
                {detail.landlord_approval_note && <p className="text-xs text-muted">{detail.landlord_approval_note}</p>}
              </div>
            </Section>

            {/* Notes + links */}
            <Section title="Notes & links">
              <p className="mb-2.5 text-[13px] text-muted">{detail.notes || "No notes on the record."}</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.property_link && <LinkChip href={detail.property_link} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Listing" />}
                {detail.photo_folder_url && <LinkChip href={detail.photo_folder_url} icon={<Images className="h-3.5 w-3.5" />} label="Photos" />}
                <LinkChip
                  href={`https://novahavens.monday.com/boards/18415735059/pulses/${detail.monday_item_id}`}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  label="Open in Monday"
                />
              </div>
              <p className="mt-3 text-xs text-muted">
                Synced from Monday {detail.synced_at ? new Date(detail.synced_at).toLocaleString("en-US") : "—"} · Monday is the system of record.
              </p>
            </Section>
          </>
        )}
      </div>

      {/* Footer: primary action, then Phase 2 slots */}
      <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 py-3">
        {add.kind === "error" && (
          <div className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
            <span className="font-medium">Not added.</span> {add.message}
          </div>
        )}

        {!isAttached ? (
          <>
            {claimId && (
              <p className="truncate text-xs text-muted">
                Adding to: <span className="font-medium text-ink">{claimName ?? `claim ${claimId}`}</span>
              </p>
            )}
            <button
              type="button"
              disabled={!detail || !!addDisabledReason || add.kind === "adding"}
              onClick={handleAdd}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition",
                addDisabledReason ? "cursor-not-allowed bg-surface-muted text-muted" : "bg-ink text-bg hover:brightness-110 active:brightness-95",
              )}
            >
              {add.kind === "adding" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding to claim…
                </>
              ) : group === "dnu" ? (
                <>
                  <Ban className="h-3.5 w-3.5" /> DO NOT USE
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" /> Add to claim
                </>
              )}
            </button>
            <p className="text-center text-xs text-muted">
              {addDisabledReason ?? "One sub-item, status “Ready to Submit”. One at a time is the quality gate."}
            </p>
          </>
        ) : (
          <>
            <div
              role="status"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium"
              style={{ borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-ink)" }}
            >
              <Check className="h-3.5 w-3.5" /> On this claim
            </div>
            <p className="text-center text-xs text-muted">
              Sub-item created · “Ready to Submit” ·{" "}
              <a
                href={`https://novahavens.monday.com/boards/9030696652/pulses/${claimId ?? ""}`}
                target="_blank"
                rel="noreferrer noopener"
                className="no-underline"
              >
                open on Monday →
              </a>
            </p>
          </>
        )}

        <div className="mt-0.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Call the owner through Quo — Phase 2"
            className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-dashed border-line2 bg-transparent text-[13px] text-muted"
          >
            <Phone className="h-3 w-3" />
            <span>Call via Quo</span>
            <span className="rounded border border-line px-1 text-[10px] tracking-wide">P2</span>
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Text the owner through Quo — Phase 2"
            className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-dashed border-line2 bg-transparent text-[13px] text-muted"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Text via Quo</span>
            <span className="rounded border border-line px-1 text-[10px] tracking-wide">P2</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

// ---------- fit computation ----------

function computeFit(d: PropertyDetail, n: ClaimNeeds): { title: string; state: FitState; text: string }[] {
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
    const ps = (d.pet_status ?? "").trim().toLowerCase();
    if (ps === "yes" || ps === "y" || ps === "true") pets = { state: "ok", text: `Pets allowed; the family has ${n.pets}.` };
    else if (ps === "no" || ps === "n" || ps === "false") pets = { state: "bad", text: `Pets not allowed; the family has ${n.pets}.` };
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

// ---------- small presentational pieces ----------

const FIT_STYLE: Record<FitState, { glyph: string; bg: string; fg: string; label: string }> = {
  ok: { glyph: "✓", bg: "var(--ok-bg)", fg: "var(--ok-ink)", label: "Meets" },
  warn: { glyph: "!", bg: "var(--amber-bg)", fg: "var(--amber-ink)", label: "Falls short" },
  bad: { glyph: "×", bg: "var(--bad-bg)", fg: "var(--bad-ink)", label: "Does not meet" },
  unknown: { glyph: "?", bg: "var(--surface-muted)", fg: "var(--muted)", label: "Unknown" },
};

function FitRow({ title, state, text }: { title: string; state: FitState; text: string }) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="nh-eyebrow mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Fee({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const empty = value === "—";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono", strong ? "font-semibold" : "font-normal", empty && "text-muted")}>{value}</span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-muted p-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function LinkChip({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink no-underline hover:bg-surface-muted"
    >
      {icon}
      {label}
    </a>
  );
}
