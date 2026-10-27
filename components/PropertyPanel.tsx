"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Images, Phone, Mail, Sparkles } from "lucide-react";
import type { PropertyDetail, ClaimNeeds, ApiError, Pin } from "@/lib/types";
import { BAD_LINK } from "@/lib/types";
import { STATUS, asMapStatus, reasonText, type MapStatus } from "@/lib/status";
import { chipsFor, mergeChipSource } from "@/lib/chips";
import { StatusDot } from "./StatusDot";
import StatusChips from "./StatusChips";
import { computeFit, FitRow } from "./property/fit";
import PanelFooter from "./property/PanelFooter";
import ContactDigest from "./property/ContactDigest";
import { Fee, LinkChip, Row, Section, Tile } from "./property/parts";
import { ReportBadLink, ReportedNote, type Reported } from "./property/ReportBadLink";
import { MONDAY_BOARDS, mondayItemUrl, money, num, dateShort, miles, yesNo } from "@/lib/utils";

interface Props {
  propertyId: string;
  /** The list's copy of this property: shows the chips and distance before the detail has loaded, and covers an API that omits fields. */
  pin: Pin | null;
  claim: { id: string; name: string; accountManager: string | null } | null;
  needs: ClaimNeeds | null;
  attached: boolean;
  onAttached: (propertyId: string, subitemId: string) => void;
  onFlagged: (propertyId: string) => void;
  onClose: () => void;
}

const STATUS_TOKEN: Record<MapStatus, { bg: string; ink: string; line: string }> = {
  green: { bg: "var(--ok-bg)", ink: "var(--ok-ink)", line: "var(--ok-line)" },
  yellow: { bg: "var(--surface-muted)", ink: "var(--ink)", line: "var(--line2)" },
  red: { bg: "var(--bad-bg)", ink: "var(--bad-ink)", line: "var(--bad-line)" },
};

export default function PropertyPanel({ propertyId, pin, claim, needs, attached, onAttached, onFlagged, onClose }: Props) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Reported | null>(null);

  useEffect(() => {
    let cancelled = false;
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

  const status = asMapStatus(detail?.map_status);
  const statusToken = STATUS_TOKEN[status];
  const fitRows = detail && needs ? computeFit(detail, needs) : [];

  const source = mergeChipSource(detail, pin);
  const { chips, otherClaims, badLink } = chipsFor(reported ? { ...source, link_status: BAD_LINK } : source, claim?.id ?? null);

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
                  style={{ background: statusToken.bg, color: statusToken.ink, border: `1px solid ${statusToken.line}` }}
                  title={STATUS[status].help}
                >
                  <StatusDot status={status} />
                  {STATUS[status].label}
                </span>
                {pin && <span className="text-[13px] text-muted">{miles(pin.distance_miles)} from the loss</span>}
              </div>
              <StatusChips chips={chips} className="mt-1.5" />
              <h2 className="mt-1.5 truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">{detail.name ?? "Property"}</h2>
              <p className="truncate text-[13px] text-muted">
                {detail.address ?? [detail.city, detail.state, detail.zipcode].filter(Boolean).join(", ")}
              </p>
              {detail.location_precision === "approximate" && (
                <p className="mt-0.5 text-[12px] text-muted" title="Pinned from the listing site or the street, not a confirmed house number">
                  ≈ Approximate location · confirm the street address with the host
                </p>
              )}
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
            {/* Why this colour, and what we have written down about the owner and the property */}
            <div className="border-b border-line px-4 py-3">
              <div
                className="flex items-start gap-2 rounded-md border px-2.5 py-2 text-[13px]"
                style={{ background: statusToken.bg, color: statusToken.ink, borderColor: statusToken.line }}
              >
                <StatusDot status={status} className="mt-1" />
                <div className="min-w-0">
                  <div className="font-medium">{STATUS[status].label}</div>
                  <div className="text-xs opacity-90">{reasonText(detail.map_reason)}</div>
                  {detail.landlord_approval_note && <p className="mt-1 break-words text-xs">{detail.landlord_approval_note}</p>}
                </div>
              </div>
              {detail.notes && (
                <details className="group mt-2.5" open={detail.notes.length <= 220}>
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted">
                    <span>Notes</span>
                    <span className="group-open:hidden">Show</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[13px]">{detail.notes}</p>
                </details>
              )}
            </div>

            {otherClaims.length > 0 && (
              <Section title="Other claims">
                <ul className="flex flex-col gap-1 text-[13px]">
                  {otherClaims.map((c) => (
                    <li key={c.subitemId} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{c.claimName}</span>
                      <span className="shrink-0 text-muted">{c.status ?? "no status"}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

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
                    href={mondayItemUrl(MONDAY_BOARDS.claim, claim?.id)}
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
                {(detail.owner_phone || detail.landlord_phone) && <ContactDigest propertyId={detail.monday_item_id} />}
              </div>
            </Section>

            {/* Notes + links */}
            <Section title="Notes & links">
              <p className="mb-2.5 text-[13px] text-muted">{detail.notes || "No notes on the record."}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {detail.property_link && (
                  <LinkChip
                    href={detail.property_link}
                    icon={<ExternalLink className="h-3.5 w-3.5" />}
                    label="Listing"
                    struck={badLink}
                  />
                )}
                {detail.photo_folder_url && <LinkChip href={detail.photo_folder_url} icon={<Images className="h-3.5 w-3.5" />} label="Photos" />}
                <LinkChip
                  href={mondayItemUrl(MONDAY_BOARDS.property, detail.monday_item_id)}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  label="Open in Monday"
                />
              </div>
              {detail.property_link && !badLink && (
                <ReportBadLink
                  propertyId={detail.monday_item_id}
                  onReported={(r) => {
                    setReported(r);
                    onFlagged(detail.monday_item_id);
                  }}
                />
              )}
              {reported && <ReportedNote reported={reported} />}
              <p className="mt-3 text-xs text-muted">
                Synced from Monday {detail.synced_at ? new Date(detail.synced_at).toLocaleString("en-US") : "—"} · Monday is the system of record.
              </p>
            </Section>
          </>
        )}
      </div>

      <PanelFooter
        propertyId={propertyId}
        detail={detail}
        status={status}
        claim={claim}
        otherClaims={otherClaims}
        attached={attached}
        onAttached={onAttached}
      />
    </aside>
  );
}
