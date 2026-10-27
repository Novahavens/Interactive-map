"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Images, Mail, Pencil, Sparkles } from "lucide-react";
import type { PropertyDetail, ClaimNeeds, ApiError, Pin } from "@/lib/types";
import { BAD_LINK } from "@/lib/types";
import { STATUS, asMapStatus, reasonText, type MapStatus } from "@/lib/status";
import { chipsFor, mergeChipSource } from "@/lib/chips";
import { StatusDot } from "./StatusDot";
import StatusChips from "./StatusChips";
import { computeFit, FitRow } from "./property/fit";
import PanelFooter from "./property/PanelFooter";
import KeyFacts from "./property/KeyFacts";
import ContactDigest from "./property/ContactDigest";
import ContactActions from "./property/ContactActions";
import { Fee, LinkChip, Row, Section } from "./property/parts";
import { ReportBadLink, ReportedNote, type Reported } from "./property/ReportBadLink";
import AvailabilityPill from "./property/AvailabilityPill";
import EditListing, { type SavedOutcome } from "./property/EditListing";
import { editingEnabled } from "./property/health";
import { availabilityPill, localToday } from "@/lib/availability";
import { MONDAY_BOARDS, mondayItemUrl, money, num, miles, yesNo } from "@/lib/utils";

interface Props {
  propertyId: string;
  /** The list's copy of this property: shows the chips and distance before the detail has loaded, and covers an API that omits fields. */
  pin: Pin | null;
  claim: { id: string; name: string; accountManager: string | null } | null;
  needs: ClaimNeeds | null;
  attached: boolean;
  onAttached: (propertyId: string, subitemId: string) => void;
  onFlagged: (propertyId: string) => void;
  /** The latest saved edit (from either panel mount, at `at` ms): this mount takes it when it is this property and newer than the mount. */
  edited: { detail: PropertyDetail; at: number } | null;
  onEdited: (detail: PropertyDetail) => void;
  /** Bumped when something outside the panel (close, another property, another claim) needs the edit form to ask "Discard N changes?". */
  discardAsk: number;
  /** How many unsaved changes the edit form holds (0 when it is closed). */
  onDirty: (count: number) => void;
  /** The answer to that question: true = Discard (run the action that asked), false = Keep editing. */
  onDiscardDecision: (discard: boolean) => void;
  onClose: () => void;
}

const SAVED_MS = 6000;

function savedText(o: SavedOutcome): string {
  if (o.dryRun) return "Dry run: nothing was written to Monday.";
  return o.noted ? "Saved to Monday." : "Saved to Monday. The Monday note couldn't be posted.";
}

const STATUS_TOKEN: Record<MapStatus, { bg: string; ink: string; line: string }> = {
  green: { bg: "var(--ok-bg)", ink: "var(--ok-ink)", line: "var(--ok-line)" },
  yellow: { bg: "var(--surface-muted)", ink: "var(--ink)", line: "var(--line2)" },
  red: { bg: "var(--bad-bg)", ink: "var(--bad-ink)", line: "var(--bad-line)" },
};

export default function PropertyPanel({
  propertyId,
  pin,
  claim,
  needs,
  attached,
  onAttached,
  onFlagged,
  edited,
  onEdited,
  discardAsk,
  onDirty,
  onDiscardDecision,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  // Edit waits for this panel's own read, so the form never starts from an older copy.
  const [fetched, setFetched] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const savedHere = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Reported | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const focusEdit = useRef(false);

  useEffect(() => {
    let live = true;
    void editingEnabled().then((on) => live && setCanEdit(on));
    return () => {
      live = false;
    };
  }, []);

  // A save in the other mount (rail or sheet) lands here too, so the two never disagree.
  // An edit saved before this panel mounted is ignored: the panel's own read is at least as fresh.
  useEffect(() => {
    if (!edited || edited.detail.monday_item_id !== propertyId || edited.at < mountedAt) return;
    savedHere.current = true;
    setDetail(edited.detail);
  }, [edited, propertyId, mountedAt]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), SAVED_MS);
    return () => clearTimeout(t);
  }, [saved]);

  // Back on the Edit button once the form has gone (it is invisible while editing).
  useEffect(() => {
    if (!editing && focusEdit.current) {
      focusEdit.current = false;
      editRef.current?.focus();
    }
  }, [editing]);

  function closeEditor() {
    focusEdit.current = true;
    setEditing(false);
  }

  function handleSaved(next: PropertyDetail, outcome: SavedOutcome) {
    savedHere.current = true;
    setDetail(next);
    setSaved(savedText(outcome));
    closeEditor();
    onEdited(next);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}`, { cache: "no-store" });
        const json = (await res.json()) as PropertyDetail | ApiError;
        if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
        // A save that landed while this read was in flight is newer than it.
        if (!cancelled && !savedHere.current) setDetail(json as PropertyDetail);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this property");
      } finally {
        if (!cancelled) setFetched(true);
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
  const { chips, otherClaims, badLink } = chipsFor(reported ? { ...source, link_status: BAD_LINK } : source, claim?.id ?? null, {
    availability: false,
  });
  // Before the detail loads the list's copy shows it (pins carry next_availability as available_from).
  const pill = availabilityPill(
    {
      availability: source.availability,
      availability_checked: detail?.availability_checked ?? pin?.availability_checked,
      next_availability: detail && detail.next_availability !== undefined ? detail.next_availability : pin?.available_from,
    },
    localToday(),
  );

  return (
    <aside
      className="flex h-full w-full flex-col border-line bg-surface text-ink shadow-2xl sm:w-[400px] sm:border-l"
      aria-label="Property details"
    >
      {/* Header */}
      {/* The pill has the header's full width to itself; Edit and Close sit beside the status line under it. */}
      <div className="border-b border-line px-4 py-3.5">
        {pill && <AvailabilityPill pill={pill} className="mb-2.5" />}
        <div className="flex items-start gap-3">
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
        <div className="flex shrink-0 items-center gap-1.5">
          {detail && canEdit && (
            // Kept in place (invisible) while editing so the header doesn't reflow.
            <button
              ref={editRef}
              type="button"
              aria-hidden={editing || undefined}
              tabIndex={editing ? -1 : undefined}
              disabled={!fetched}
              title={fetched ? undefined : "Loading the latest copy…"}
              onClick={() => {
                setSaved(null);
                setEditing(true);
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-surface-muted disabled:opacity-50 ${editing ? "invisible" : ""} [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:px-3`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        </div>
      </div>

      {/* What the last save did; always mounted so screen readers hear it. */}
      <div aria-live="polite" className="empty:hidden">
        {saved && !editing && (
          <div
            className="flex items-start justify-between gap-2 border-b px-4 py-2 text-[13px]"
            style={{ background: "var(--ok-bg)", color: "var(--ok-ink)", borderColor: "var(--ok-line)" }}
          >
            <span className="min-w-0">{saved}</span>
            <button
              type="button"
              onClick={() => setSaved(null)}
              aria-label="Dismiss"
              className="-my-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {editing && detail ? (
        <EditListing
          propertyId={propertyId}
          detail={detail}
          discardAsk={discardAsk}
          onDirty={onDirty}
          onDiscardDecision={onDiscardDecision}
          onCancel={closeEditor}
          onSaved={handleSaved}
        />
      ) : (
      <>
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
            <KeyFacts detail={detail} />

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
                  <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-line break-words text-[13px]">{detail.notes}</p>
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
              <div className="grid grid-cols-2 gap-x-4 text-[13px]">
                <Row k="Sq ft" v={num(detail.sqft)} />
                <Row k="Type" v={detail.property_type && detail.property_type !== "N/D" ? detail.property_type : "—"} />
                <Row k="Furnished" v={yesNo(detail.furnished)} />
                <Row k="Fenced yard" v={yesNo(detail.fenced_yard)} />
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
                </div>
                {detail.owner_phone && <ContactActions phone={detail.owner_phone} name={detail.owner_name} address={detail.address} />}
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
                {detail.landlord_phone && <ContactActions phone={detail.landlord_phone} name={detail.landlord_name} address={detail.address} />}
                {detail.landlord_approval_note && <p className="text-xs text-muted">{detail.landlord_approval_note}</p>}
                {(detail.owner_phone || detail.landlord_phone) && <ContactDigest propertyId={detail.monday_item_id} />}
              </div>
            </Section>

            {/* Notes + links */}
            <Section title="Notes & links">
              <p className="mb-2.5 whitespace-pre-line break-words text-[13px] text-muted">{detail.notes || "No notes on the record."}</p>
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
      </>
      )}
    </aside>
  );
}
