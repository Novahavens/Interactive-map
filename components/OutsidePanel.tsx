"use client";

import { useState } from "react";
import { Bath, BedDouble, Check, DollarSign, ExternalLink, PawPrint, X } from "lucide-react";
import type { AddOutsideResponse, OutsideHome, SubmitStatus as SubmitStatusRow } from "@/lib/types";
import { submitDate } from "@/lib/submit-status";
import { LinkChip, Section, Tile } from "./property/parts";
import OutsideFooter from "./property/OutsideFooter";
import LandlordReplyBox, { ReplyNote, type ReplyResult } from "./property/LandlordReplyBox";
import { MONDAY_BOARDS, miles, mondayItemUrl, money, num } from "@/lib/utils";

interface Props {
  home: OutsideHome;
  claim: { id: string; name: string; accountManager: string | null } | null;
  /** After the home was added (or was already on the claim): re-read the claim and the outside list. */
  onAdded: (home: OutsideHome, res: AddOutsideResponse) => void;
  onClose: () => void;
  /** Flag `addOutside`. */
  canAdd: boolean;
  /** After a landlord reply saved an address: re-read the outside list so the pin and "Add to claim" update. */
  onAddressSaved?: () => void;
  /** Slot at the top of "Fit against this claim": the match score card. */
  score?: React.ReactNode;
  /** Slot inside "Fit against this claim", under the score: fit rows. */
  fit?: React.ReactNode;
  /** Opens the "Ask for the address" text (only pass it when there is a number to text). */
  onAskAddress?: () => void;
  /** This home's submit step once it is on the claim (flag `submit`); see OutsideFooter. */
  submit?: SubmitStatusRow | null;
  /** Slot: extra sections between "Listing" and "Notes & links" (contacts, find phone…). */
  children?: React.ReactNode;
}

const SOURCE: Record<string, { letter: string; name: string }> = {
  zillow: { letter: "Z", name: "Zillow" },
  furnished_finder: { letter: "F", name: "Furnished Finder" },
};

const EXCLUDED: Record<string, string> = {
  rent: "the rent is above the limit",
  beds: "it has too few bedrooms",
  distance: "it is too far from the loss",
  available_late: "it is available too late",
  no_price: "the listing shows no price",
  no_location: "the listing shows no location",
};

/** Only http(s) links leave the map (a listing URL is whatever the listing site gave us). */
function safeUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function petsTone(pets: string | null): { value: string; tone: "ok" | "bad" | "muted" } {
  const t = (pets ?? "").trim().toLowerCase();
  if (!t) return { value: "—", tone: "muted" };
  if (/^(no\b|n$|false$)|not allowed|no pets/.test(t)) return { value: "No", tone: "bad" };
  if (/^(yes|y|true)$|allowed|ok|friendly|welcome|considered/.test(t)) return { value: "Yes", tone: "ok" };
  return { value: "Ask", tone: "muted" };
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
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted">
        {icon}
        {label}
      </span>
      <span className="truncate font-mono text-[15px] font-semibold leading-tight">{value}</span>
    </div>
  );
}

/**
 * The panel for a home the search agent found on a listing site and that is not in our database yet.
 * Same frame as PropertyPanel; everything it shows comes from the list's copy of the home (no read of its own).
 */
export default function OutsidePanel({ home, claim, onAdded, onClose, canAdd, score, fit, onAskAddress, submit, onAddressSaved, children }: Props) {
  // The landlord-reply result outlives the box: the list reloads after a save and the box goes away.
  const [replyNote, setReplyNote] = useState<ReplyResult | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const source = SOURCE[home.source] ?? null;
  const url = safeUrl(home.url);
  const photo = photoBroken ? null : safeUrl(home.photo);
  const area = home.precision === "area";
  const approx = home.precision === "approx";
  const pets = petsTone(home.pets);
  const place = [home.city, home.state].filter(Boolean).join(", ");
  const facts = [
    home.beds != null ? `${num(home.beds)} bd` : null,
    home.baths != null ? `${num(home.baths)} ba` : null,
  ].filter(Boolean);
  const available = submitDate(home.availableFrom);
  const reasons = home.excludedBy.map((k) => EXCLUDED[k] ?? k.replace(/_/g, " "));
  const outreachDay = submitDate(home.outreach?.repliedAt ?? home.outreach?.sentAt);

  return (
    <aside
      className="flex h-full w-full flex-col border-line bg-surface text-ink shadow-2xl sm:w-[400px] sm:border-l"
      aria-label="Property details"
      data-outside-panel={home.listingId}
    >
      {/* Header */}
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex h-5 items-center gap-1.5 rounded border border-line2 px-1.5 text-[11px] font-medium"
                title="Found on a listing site. Not in our database yet."
              >
                {source && (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[3px] bg-ink font-mono text-[9px] font-bold leading-none text-surface"
                  >
                    {source.letter}
                  </span>
                )}
                {source ? `From ${source.name}` : "Outside listing"}
              </span>
              {home.distanceMiles != null && (
                <span className="text-[13px] text-muted">
                  {area || approx ? "≈ " : ""}
                  {miles(home.distanceMiles)} from the loss
                </span>
              )}
            </div>
            {(home.isNew || home.inPropertyDb) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                {home.isNew && (
                  <span className="nh-chip nh-chip--info">
                    <span>New</span>
                  </span>
                )}
                {home.inPropertyDb && (
                  <span className="nh-chip nh-chip--ok">
                    <span>Saved to our database</span>
                  </span>
                )}
              </div>
            )}
            <h2 className="mt-1.5 truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]" title={home.title}>
              {home.title || "Outside listing"}
            </h2>
            <p className="truncate text-[13px] text-muted">
              {[place, ...facts].filter(Boolean).join(" · ")}
              {home.rent != null && (
                <>
                  {place || facts.length ? " · " : ""}
                  <span className="font-mono font-semibold text-ink">{money(home.rent)}</span>/mo
                </>
              )}
            </p>
            {area ? (
              <p className="mt-0.5 text-[12px] text-muted" title="The listing site gives an area, not a street address">
                ≈ Area only — the listing doesn&apos;t show the street
              </p>
            ) : approx ? (
              <p className="mt-0.5 text-[12px] text-muted" title="Pinned from the listing site or the street, not a confirmed house number">
                ≈ Approximate location · confirm the street address with the host
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted hover:text-ink [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="nh-scroll min-h-0 flex-1 overflow-y-auto text-sm">
        {photo && (
          <div className="border-b border-line bg-surface-muted">
            {/* A listing-site photo: any host, so no next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={`Listing photo of ${home.title}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setPhotoBroken(true)}
              className="block h-44 w-full object-cover"
            />
          </div>
        )}

        <div className="grid grid-cols-4 gap-1.5 border-b border-line px-4 py-3" aria-label="Key facts">
          <Fact icon={<BedDouble className="h-3.5 w-3.5" aria-hidden="true" />} label="Beds" value={num(home.beds)} />
          <Fact icon={<Bath className="h-3.5 w-3.5" aria-hidden="true" />} label="Baths" value={num(home.baths)} />
          <Fact icon={<DollarSign className="h-3.5 w-3.5" aria-hidden="true" />} label="Rent / mo" value={money(home.rent)} />
          <Fact icon={<PawPrint className="h-3.5 w-3.5" aria-hidden="true" />} label="Pets" value={pets.value} tone={pets.tone} />
        </div>

        {(score || fit || reasons.length > 0) && (
          <Section title="Fit against this claim">
            {score}
            {fit}
            {reasons.length > 0 && (
              <p
                className="rounded-md border border-amber-line bg-amber-bg px-2.5 py-2 text-[13px] text-amber-ink [&:not(:first-child)]:mt-2"
                data-outside-excluded
              >
                <span className="font-medium">Outside the search.</span> {reasons.join("; ").replace(/^./, (c) => c.toUpperCase())}.
              </p>
            )}
          </Section>
        )}

        <Section title="Listing">
          <div className="grid grid-cols-2 gap-1.5 text-[13px]">
            <Tile label="Available" value={available ? `From ${available}` : "Not on the listing"} />
            <Tile label="Pets" value={home.pets?.trim() || "Not on the listing"} />
            <Tile label="Address" value={home.addressKnown ? "On the listing" : "Not shown"} />
            <Tile label="Phone" value={home.hasPhone ? "On the listing" : "None yet"} />
          </div>
          {home.outreach && outreachDay && (
            <p className="mt-2 text-xs" aria-live="polite" data-outside-outreach>
              {home.outreach.repliedAt ? (
                <span className="inline-flex items-center gap-1 text-ok-ink">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Replied {outreachDay}
                </span>
              ) : (
                <span className="text-muted">Asked {outreachDay} · no reply yet</span>
              )}
            </p>
          )}
        </Section>

        {children}

        {home.source === "furnished_finder" && !home.addressKnown && (
          <LandlordReplyBox
            listingId={home.listingId}
            onSaved={(note) => {
              setReplyNote(note);
              onAddressSaved?.();
            }}
          />
        )}
        {replyNote && <ReplyNote note={replyNote} />}

        <Section title="Notes & links">
          <p className="mb-2.5 text-[13px] text-muted">
            {home.inPropertyDb
              ? "This home is in our database too."
              : "Not in our database yet. Adding it to a claim saves it."}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {url && (
              <LinkChip
                href={url}
                icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                label={source ? `Open on ${source.name}` : "Open the listing"}
              />
            )}
            {home.propertyItemId && (
              <LinkChip
                href={mondayItemUrl(MONDAY_BOARDS.property, home.propertyItemId)}
                icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                label="Open in Monday"
              />
            )}
            {!url && !home.propertyItemId && <span className="text-xs text-muted">No link on this listing.</span>}
          </div>
        </Section>
      </div>

      <OutsideFooter home={home} claim={claim} canAdd={canAdd} onAdded={onAdded} onAskAddress={onAskAddress} submit={submit} />
    </aside>
  );
}
