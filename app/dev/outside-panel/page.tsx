"use client";

// Dev-only preview of pillar D: the outside-home panel, its footer in every state, the submit steps,
// and the two optional props on PanelFooter and ClaimBrief. Never ships: 404 in production.
// Data is copied from tests/fixtures/map-agent.mjs (all fictional). tests/browser/outside-panel.mjs drives it.
import { useState } from "react";
import { notFound } from "next/navigation";
import type { AddOutsideResponse, ClaimBrief as Brief, OutsideHome, SubmitStatus as SubmitStatusRow } from "@/lib/types";
import OutsidePanel from "@/components/OutsidePanel";
import OutsideFooter from "@/components/property/OutsideFooter";
import PanelFooter from "@/components/property/PanelFooter";
import SubmitStatus from "@/components/property/SubmitStatus";
import ClaimBrief from "@/components/ClaimBrief";

const CLAIM = { id: "9900000001", name: "Sample family", accountManager: "Alex Example" };

const home = (o: Partial<OutsideHome> & { listingId: string; rank: number; title: string }): OutsideHome => ({
  source: "zillow", url: null, addressKnown: true, city: "Tulsa", state: "OK", beds: 3, baths: 2, rent: 2400, lat: null, lng: null,
  precision: null, distanceMiles: null, score: null, fits: true, excludedBy: [], isNew: false, inPropertyDb: false,
  propertyItemId: null, onClaim: false, hasPhone: false, availableFrom: null, pets: null, photo: null, outreach: null, ...o,
});
const id = (n: number) => `11111111-1111-4111-8111-1111111111${String(n).padStart(2, "0")}`;

const H = {
  zillowExact: home({ listingId: id(1), rank: 1, title: "4100 Sample Ave", url: "https://example.com/zillow/4100-sample-ave", lat: 36.1612, lng: -95.9801, precision: "exact", distanceMiles: 0.9, score: 91, rent: 2350, hasPhone: true, pets: "Pets allowed", availableFrom: "2026-12-01", photo: "https://example.com/photos/4100.jpg" }),
  zillowNew: home({ listingId: id(2), rank: 2, title: "77 Placeholder Ln", url: "https://example.com/zillow/77-placeholder-ln", lat: 36.1399, lng: -95.9702, precision: "exact", distanceMiles: 1.6, score: 86, rent: 2600, beds: 4, baths: 2.5, isNew: true }),
  zillowOnClaim: home({ listingId: id(3), rank: 3, title: "912 Example St", url: "https://example.com/zillow/912-example-st", lat: 36.1702, lng: -96.0105, precision: "exact", distanceMiles: 1.5, score: 80, rent: 2200, inPropertyDb: true, propertyItemId: "9900000101", onClaim: true }),
  zillowApprox: home({ listingId: id(4), rank: 4, title: "2300 Fixture Blvd", url: "https://example.com/zillow/2300-fixture-blvd", lat: 36.1208, lng: -95.9406, precision: "approx", distanceMiles: 3.7, score: 72, rent: 2500, isNew: true }),
  ffArea: home({ listingId: id(5), rank: 5, source: "furnished_finder", title: "Cozy 3BR near Midtown", url: "https://example.com/ff/cozy-3br-midtown", addressKnown: false, lat: 36.1335, lng: -95.9609, precision: "area", distanceMiles: 2.3, rent: 2700, pets: "Pets allowed", availableFrom: "2026-12-15" }),
  ffNoCoords: home({ listingId: id(6), rank: 6, source: "furnished_finder", title: "Furnished bungalow, fenced yard", url: "https://example.com/ff/furnished-bungalow", addressKnown: false, precision: "area", rent: 2450, beds: 2, baths: 1 }),
  ffAsked: home({ listingId: id(7), rank: 7, source: "furnished_finder", title: "Quiet 3BR for traveling families", url: "https://example.com/ff/quiet-3br", addressKnown: false, precision: "area", rent: 2550, city: "Broken Arrow", hasPhone: true, outreach: { status: "sent", channel: "ff_message", sentAt: "2026-11-25T18:30:00.000Z", sentBy: "Alex Example", repliedAt: null } }),
  stretch: home({ listingId: id(8), rank: 8, title: "5 Stretch Ct", url: "https://example.com/zillow/5-stretch-ct", lat: 36.0903, lng: -95.9204, precision: "exact", distanceMiles: 5.9, score: 48, rent: 3400, beds: 4, baths: 3, fits: false, excludedBy: ["rent"], pets: "No pets" }),
  // Not in the fixture: the listing says the address is known, the server finds it is not (409 no_address).
  lateNoAddress: home({ listingId: id(9), rank: 9, title: "18 Maybe Rd", url: "https://example.com/zillow/18-maybe-rd", precision: "exact", distanceMiles: 2.8, rent: 2300 }),
  timeout: home({ listingId: id(10), rank: 10, title: "640 Slow St", precision: "exact", distanceMiles: 4.1, rent: 2250 }),
  slow: home({ listingId: id(11), rank: 11, title: "31 Waiting Way", precision: "exact", distanceMiles: 1.1, rent: 2150 }),
  unknownSource: home({ listingId: id(12), rank: 12, source: "other_site", title: "A listing with a very long title that has to be cut off somewhere in the header", url: "javascript:alert(1)", beds: null, baths: null, rent: null }),
};

const row = (o: Partial<SubmitStatusRow> & { state: SubmitStatusRow["state"] }): SubmitStatusRow => ({
  subitemId: "9900000201", propertyId: "9900000101", reason: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null, ...o,
});
const S = {
  todo: row({ state: "todo" }),
  ready: row({ state: "ready", approvedBy: "Alex Example", approvedAt: "2026-11-25T18:20:00.000Z" }),
  readyNoApprover: row({ state: "ready" }),
  submitted: row({ state: "submitted", approvedBy: "Alex Example", approvedAt: "2026-11-25T18:00:00.000Z", submittedBy: "Sam Sample", submittedAt: "2026-11-26T17:10:00.000Z" }),
  claimClosed: row({ state: "blocked", reason: "claim_closed" }),
  alreadySubmitted: row({ state: "blocked", reason: "already_submitted", submittedAt: "2026-11-20T17:10:00.000Z" }),
  blockedOther: row({ state: "blocked", reason: "Availability has not been checked in the last 7 days" }),
};

const BRIEF: Brief = {
  status: "Searching", group: "New Housing Request", company: "Example Mutual", receivedOn: "2026-11-18", moveIn: "2026-12-08",
  leaseMonths: 6, adults: 2, children: 2, pets: 1, bedrooms: 3, bathrooms: 2, frv: 3200, utilityCap: null, petDescription: "One small dog",
  accountManager: "Alex Example", searcher: null, coordinator: null, specialRequests: null,
};

function Case({ name, title, wide, children }: { name: string; title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div data-case={name} className={`flex flex-col gap-1.5 ${wide ? "w-full sm:w-[400px]" : "w-full max-w-[400px]"}`}>
      <div className="nh-eyebrow">{title}</div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">{children}</div>
    </div>
  );
}

export default function OutsidePanelPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const [log, setLog] = useState<string[]>([]);
  const note = (s: string) => setLog((l) => [...l, s]);
  const onAdded = (h: OutsideHome, res: AddOutsideResponse) =>
    note(`added ${h.listingId} sub=${res.subitemId} property=${res.propertyId} already=${res.alreadyOnClaim}`);
  const footer = (h: OutsideHome, extra: Partial<React.ComponentProps<typeof OutsideFooter>> = {}) => (
    <OutsideFooter home={h} claim={CLAIM} canAdd onAdded={onAdded} {...extra} />
  );
  const scoreSlot = (
    <div className="mb-2.5 rounded-lg border border-dashed border-line2 px-3 py-2 text-xs text-muted" data-slot="score">
      Score slot (MatchScore goes here)
    </div>
  );

  return (
    <main className="h-dvh overflow-y-auto bg-bg p-2 text-ink sm:p-6">
      <h1 className="text-lg font-semibold">Outside panel · preview</h1>
      <p className="mb-4 text-[13px] text-muted">Pillar D. Every state from the spec, on fictional data.</p>
      <pre data-log className="mb-4 whitespace-pre-wrap text-xs text-muted">{log.join("\n")}</pre>

      <h2 className="nh-eyebrow mb-2">OutsidePanel</h2>
      <div className="mb-8 flex flex-wrap items-start gap-4" data-group>
        <Case name="panel-zillow" title="Zillow · exact · photo · score slot" wide>
          <div className="h-[720px]">
            <OutsidePanel home={H.zillowExact} claim={CLAIM} canAdd onAdded={onAdded} onClose={() => note("closed")} score={scoreSlot} submit={null} />
          </div>
        </Case>
        <Case name="panel-area" title="Furnished Finder · area only · asked" wide>
          <div className="h-[720px]">
            <OutsidePanel home={H.ffAsked} claim={CLAIM} canAdd onAdded={onAdded} onClose={() => note("closed")} onAskAddress={() => note("ask-address")}>
              <section className="border-b border-line px-4 py-3 text-xs text-muted" data-slot="children">
                Children slot (contacts, find phone)
              </section>
            </OutsidePanel>
          </div>
        </Case>
        <Case name="panel-onclaim" title="Already on this claim · ready to submit" wide>
          <div className="h-[720px]">
            <OutsidePanel home={H.zillowOnClaim} claim={CLAIM} canAdd onAdded={onAdded} onClose={() => note("closed")} submit={S.ready} />
          </div>
        </Case>
        <Case name="panel-stretch" title="Does not fit the search · new" wide>
          <div className="h-[720px]">
            <OutsidePanel home={{ ...H.stretch, isNew: true }} claim={CLAIM} canAdd onAdded={onAdded} onClose={() => note("closed")} />
          </div>
        </Case>
        <Case name="panel-approx" title="Approximate location · no claim open" wide>
          <div className="h-[720px]">
            <OutsidePanel home={H.zillowApprox} claim={null} canAdd onAdded={onAdded} onClose={() => note("closed")} />
          </div>
        </Case>
        <Case name="panel-bare" title="Unknown source · nothing known · adding off" wide>
          <div className="h-[720px]">
            <OutsidePanel home={H.unknownSource} claim={CLAIM} canAdd={false} onAdded={onAdded} onClose={() => note("closed")} />
          </div>
        </Case>
      </div>

      <h2 className="nh-eyebrow mb-2">OutsideFooter</h2>
      <div className="mb-8 flex flex-wrap items-start gap-4" data-group>
        <Case name="foot-add" title="Ready to add (answers 201)">{footer(H.zillowExact, { submit: null })}</Case>
        <Case name="foot-add-plain" title="Ready to add, submit flag off (201)">{footer(H.zillowNew)}</Case>
        <Case name="foot-slow" title="Adding (slow answer)">{footer(H.slow)}</Case>
        <Case name="foot-already" title="Server says already on claim (200)">{footer(H.zillowApprox)}</Case>
        <Case name="foot-dry" title="Dry run">{footer({ ...H.ffNoCoords, addressKnown: true })}</Case>
        <Case name="foot-409" title="Server says no address (409)">{footer(H.lateNoAddress, { onAskAddress: () => note("ask-address") })}</Case>
        <Case name="foot-error" title="Error (504)">{footer(H.timeout)}</Case>
        <Case name="foot-off-503" title="Server says switched off (503)">{footer(H.stretch)}</Case>
        <Case name="foot-blocked" title="Address unknown · with a number to text">{footer(H.ffArea, { onAskAddress: () => note("ask-address") })}</Case>
        <Case name="foot-blocked-nonumber" title="Address unknown · no number">{footer(H.ffNoCoords)}</Case>
        <Case name="foot-onclaim" title="Already on this claim">{footer(H.zillowOnClaim, { submit: S.submitted })}</Case>
        <Case name="foot-noclaim" title="No claim open">
          <OutsideFooter home={H.zillowExact} claim={null} canAdd onAdded={onAdded} />
        </Case>
        <Case name="foot-off" title="Feature off (renders nothing)">
          <OutsideFooter home={H.zillowExact} claim={CLAIM} canAdd={false} onAdded={onAdded} />
        </Case>
        <Case name="foot-off-onclaim" title="Feature off · home on the claim">
          <OutsideFooter home={H.zillowOnClaim} claim={CLAIM} canAdd={false} onAdded={onAdded} />
        </Case>
      </div>

      <h2 className="nh-eyebrow mb-2">SubmitStatus</h2>
      <div className="mb-8 flex flex-wrap items-start gap-4" data-group>
        {(
          [
            ["submit-todo", "To Do", S.todo],
            ["submit-ready", "Ready to Submit", S.ready],
            ["submit-ready-noapprover", "Ready · no approver yet", S.readyNoApprover],
            ["submit-submitted", "Option Submitted", S.submitted],
            ["submit-blocked-closed", "Blocked · claim closed", S.claimClosed],
            ["submit-blocked-already", "Blocked · already submitted", S.alreadySubmitted],
            ["submit-blocked-other", "Blocked · reason from the back end", S.blockedOther],
          ] as const
        ).map(([name, title, s]) => (
          <Case key={name} name={name} title={title}>
            <div className="px-4 py-3">
              <SubmitStatus status={s} />
            </div>
          </Case>
        ))}
        <Case name="submit-loading" title="Loading">
          <div className="px-4 py-3">
            <SubmitStatus status={null} loading />
          </div>
        </Case>
        <Case name="submit-unknown" title="Unknown (renders nothing)">
          <div className="px-4 py-3">
            <SubmitStatus status={null} />
          </div>
        </Case>
      </div>

      <h2 className="nh-eyebrow mb-2">PanelFooter (our own homes)</h2>
      <div className="mb-8 flex flex-wrap items-start gap-4" data-group>
        <Case name="pf-plain" title="On the claim · no submit prop (as today)">
          <PanelFooter propertyId="9900000101" detail={null} status="green" claim={CLAIM} otherClaims={[]} attached onAttached={() => {}} />
        </Case>
        <Case name="pf-submit" title="On the claim · ready">
          <PanelFooter propertyId="9900000102" detail={null} status="green" claim={CLAIM} otherClaims={[]} attached onAttached={() => {}} submit={S.ready} />
        </Case>
        <Case name="pf-blocked" title="On the claim · blocked">
          <PanelFooter propertyId="9900000104" detail={null} status="green" claim={CLAIM} otherClaims={[]} attached onAttached={() => {}} submit={S.claimClosed} />
        </Case>
        <Case name="pf-notattached" title="Not on the claim · submit ignored">
          <PanelFooter propertyId="9900000105" detail={null} status="green" claim={CLAIM} otherClaims={[]} attached={false} onAttached={() => {}} submit={S.ready} />
        </Case>
      </div>

      <h2 className="nh-eyebrow mb-2">ClaimBrief</h2>
      <div className="flex flex-wrap items-start gap-4" data-group>
        <div data-case="brief-plain" className="flex w-80 max-w-full flex-col gap-1.5">
          <div className="nh-eyebrow">No counts (as today)</div>
          <ClaimBrief name={CLAIM.name} brief={BRIEF} hideGlance />
        </div>
        <div data-case="brief-counts" className="flex w-80 max-w-full flex-col gap-1.5">
          <div className="nh-eyebrow">3 ready · 2 submitted</div>
          <ClaimBrief name={CLAIM.name} brief={BRIEF} hideGlance submitCounts={{ ready: 3, submitted: 2 }} />
        </div>
        <div data-case="brief-zero" className="flex w-80 max-w-full flex-col gap-1.5">
          <div className="nh-eyebrow">Options, none ready</div>
          <ClaimBrief name={CLAIM.name} brief={BRIEF} hideGlance submitCounts={{ ready: 0, submitted: 0, options: 4 }} />
        </div>
        <div data-case="brief-none" className="flex w-80 max-w-full flex-col gap-1.5">
          <div className="nh-eyebrow">No options</div>
          <ClaimBrief name={CLAIM.name} brief={BRIEF} hideGlance submitCounts={{ ready: 0, submitted: 0, options: 0 }} />
        </div>
      </div>
    </main>
  );
}
