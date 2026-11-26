"use client";

// Dev-only preview of the Best match sort, outside rows and the score display, in every state of the spec.
// Fictional data from tests/fixtures/map-agent.mjs. Never ships: it answers 404 in production.
import { notFound } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import MatchScore from "@/components/MatchScore";
import OutsideRow, { NoLocationDivider } from "@/components/OutsideRow";
import ResultRow from "@/components/ResultRow";
import SortToggle from "@/components/SortToggle";
import { bestMatchAvailable, effectiveSort, itemId, noLocationStart, sortResults, type SortMode } from "@/lib/result-sort";
import type { MatchScore as Score, OutsideHome, Pin } from "@/lib/types";
// @ts-expect-error plain JS fixtures, shared with the browser tests
import { CLAIM_ID, HOME, OUTSIDE, SCORES } from "../../../tests/fixtures/map-agent.mjs";

const pin = (o: Partial<Pin> & Pick<Pin, "monday_item_id" | "name" | "distance_miles">): Pin => ({
  lat: 36.15, lng: -95.99, group_title: "Properties", addable: true, bedrooms: 3, bathrooms: 2, monthly_rate: 2400, pet_status: null,
  has_photos: false, available_from: null, map_status: "yellow", availability: null, availability_checked: null, last_contact: null,
  link_status: null, other_claims: [], ...o,
});

// Six scored homes of ours (ids match SCORES), three without a score, one of them "do not use".
const PINS: Pin[] = [
  pin({ monday_item_id: "9900000101", name: "912 Example St", distance_miles: 1.5, monthly_rate: 2200, map_status: "green", availability: "Available Now", has_photos: true }),
  pin({ monday_item_id: "9900000102", name: "18 Sample Row", distance_miles: 2.8, monthly_rate: 2450, pet_status: "Yes" }),
  pin({ monday_item_id: "9900000103", name: "640 Fiction Way", distance_miles: 4.1, monthly_rate: 2100, bedrooms: 4, bathrooms: 3, map_status: "green", availability: "Available Soon" }),
  pin({ monday_item_id: "9900000104", name: "7 Pretend Pl", distance_miles: 6.3, monthly_rate: 2850, bathrooms: 1.5, availability: "Available (Unverified)" }),
  pin({ monday_item_id: "9900000105", name: "250 Made Up Blvd", distance_miles: 3.0, monthly_rate: 3750, bedrooms: 4, last_contact: "2026-11-20" }),
  pin({ monday_item_id: "9900000106", name: "61 Faraway Rd", distance_miles: 61.2, monthly_rate: 1600 }),
  pin({ monday_item_id: "9900000111", name: "33 Placeholder Ct", distance_miles: 0.6, map_status: "green" }),
  pin({ monday_item_id: "9900000112", name: "5 Invented St", distance_miles: 2.0 }),
  pin({ monday_item_id: "9900000113", name: "1 Do Not Use Dr", distance_miles: 0.4, map_status: "red", monthly_rate: 1900 }),
];
const HOMES = OUTSIDE.homes as OutsideHome[];
const ALL_SCORES = SCORES.scores as Score[];
const FRV = 2500;
const WHY: Record<string, string> = {
  [HOME.zillowExact]: "Right size, pets ok, inside the FRV",
  [HOME.zillowNew]: "One more bedroom, $100 over the FRV",
  [HOME.zillowApprox]: "Right size, inside the FRV",
};
const byId = (id: string) => HOMES.find((h) => h.listingId === id)!;
const noop = () => {};

function Card({ title, children, state }: { title: string; children: React.ReactNode; state: string }) {
  return (
    <section data-state={state} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <h3 className="nh-eyebrow m-0">{title}</h3>
      {children}
    </section>
  );
}

function LiveList() {
  const [choice, setChoice] = useState<SortMode>("best");
  const [scoresOn, setScoresOn] = useState(true);
  const [outsideOn, setOutsideOn] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const onSelect = useCallback((id: string) => setSelectedId(id), []);
  const onHover = useCallback((id: string | null) => setHoveredId(id), []);

  const scores = scoresOn ? ALL_SCORES : null;
  const outside = outsideOn ? HOMES : null;
  const bestAvailable = useMemo(() => bestMatchAvailable(sortResults({ pins: PINS, outside, scores, mode: "nearest" })), [outside, scores]);
  const mode = effectiveSort(choice, bestAvailable);
  const items = useMemo(() => sortResults({ pins: PINS, outside, scores, mode }), [outside, scores, mode]);
  const divider = noLocationStart(items, mode);
  const outsideCount = items.filter((i) => i.kind === "outside").length;
  let outsideSeen = 0;

  return (
    <section data-state="live" className="flex w-full max-w-80 flex-col rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap gap-3 border-b border-line px-3 py-2 text-xs text-muted">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" data-test="scores-on" checked={scoresOn} onChange={(e) => setScoresOn(e.target.checked)} /> scores
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" data-test="outside-on" checked={outsideOn} onChange={(e) => setOutsideOn(e.target.checked)} /> outside homes
        </label>
        <span data-test="selected">{selectedId ?? "nothing selected"}</span>
      </div>
      <SortToggle
        className="px-3 pb-1.5 pt-2.5"
        value={choice}
        onChange={setChoice}
        bestAvailable={bestAvailable}
        countLabel={`${PINS.length} within 10 mi${outsideCount ? ` · ${outsideCount} outside` : ""}`}
      />
      <ul aria-label="Results" data-mode={mode} className="nh-scroll flex max-h-[640px] min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {items.map((item, i) => {
          const id = itemId(item);
          const row =
            item.kind === "ours" ? (
              <ResultRow key={id} pin={item.pin} score={item.score} selected={selectedId === id} hovered={hoveredId === id} claimId={CLAIM_ID} onSelect={onSelect} onHover={onHover} />
            ) : (
              <OutsideRow
                key={id}
                home={item.home}
                score={item.score}
                frv={FRV}
                why={outsideSeen++ < 3 ? WHY[id] : null}
                selected={selectedId === id}
                hovered={hoveredId === id}
                onSelect={onSelect}
                onHover={onHover}
              />
            );
          return divider?.index === i ? [<NoLocationDivider key="no-location" count={divider.count} />, row] : row;
        })}
      </ul>
    </section>
  );
}

export default function ListScorePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview />;
}

function Preview() {
  const [sort, setSort] = useState<SortMode>("best");
  const [retries, setRetries] = useState(0);
  const score = (id: string) => ALL_SCORES.find((s) => s.propertyId === id)!;

  return (
    <main className="h-dvh overflow-y-auto bg-bg p-4 text-ink max-sm:p-2">
      <h1 className="m-0 mb-1 text-lg font-semibold">List and score: preview</h1>
      <p className="m-0 mb-4 text-[13px] text-muted">Fictional data. Dev only.</p>

      <div className="flex flex-wrap items-start gap-4">
        <LiveList />

        <div className="flex w-full max-w-80 flex-col gap-3">
          <h2 className="m-0 text-sm font-semibold">SortToggle</h2>
          <Card title="Best match on" state="sort-best">
            <SortToggle value={sort} onChange={setSort} bestAvailable countLabel="50 within 10 mi" />
          </Card>
          <Card title="Nearest chosen" state="sort-nearest">
            <SortToggle value="nearest" onChange={noop} bestAvailable countLabel="50 within 10 mi" />
          </Card>
          <Card title="Scores loading" state="sort-loading">
            <SortToggle value="best" onChange={noop} bestAvailable={false} loading countLabel="50 within 10 mi" />
          </Card>
          <Card title="No claim open" state="sort-no-claim">
            <SortToggle value="best" onChange={noop} bestAvailable={false} claimOpen={false} countLabel="38 within 10 mi" />
          </Card>
          <Card title="No scores for this claim" state="sort-no-scores">
            <SortToggle value="best" onChange={noop} bestAvailable={false} countLabel="50 within 10 mi" />
          </Card>
          <Card title="Scores failed" state="sort-error">
            <SortToggle value="best" onChange={noop} bestAvailable={false} error onRetry={() => setRetries((n) => n + 1)} countLabel="50 within 10 mi" />
            <span data-test="retries" className="text-xs text-muted">Try again pressed {retries}×</span>
          </Card>
          <Card title="No count (phone sheet)" state="sort-bare">
            <SortToggle value="nearest" onChange={noop} bestAvailable />
          </Card>
        </div>

        <div className="flex w-full max-w-80 flex-col gap-3">
          <h2 className="m-0 text-sm font-semibold">OutsideRow</h2>
          {(
            [
              ["Exact pin, scored", "out-exact", { home: byId(HOME.zillowExact), why: WHY[HOME.zillowExact] }],
              ["New, stretch by price", "out-new", { home: byId(HOME.zillowNew), frv: FRV }],
              ["On this claim", "out-on-claim", { home: byId(HOME.zillowOnClaim), score: score("9900000101") }],
              ["Approximate pin", "out-approx", { home: byId(HOME.zillowApprox) }],
              ["Area only", "out-area", { home: byId(HOME.ffArea) }],
              ["List only (no pin)", "out-list-only", { home: byId(HOME.ffNoCoords) }],
              ["Selected", "out-selected", { home: byId(HOME.zillowExact), selected: true }],
              ["Hovered from the map", "out-hovered", { home: byId(HOME.ffArea), hovered: true }],
              ["No rent, no score", "out-bare", { home: { ...byId(HOME.ffAsked), rent: null, beds: null, baths: null } }],
            ] as [string, string, Partial<React.ComponentProps<typeof OutsideRow>> & { home: OutsideHome }][]
          ).map(([title, state, props]) => (
            <Card key={state} title={title} state={state}>
              <ul className="m-0 flex list-none flex-col p-0">
                <OutsideRow selected={false} hovered={false} onSelect={noop} onHover={noop} {...props} />
              </ul>
            </Card>
          ))}
        </div>

        <div className="flex w-full max-w-80 flex-col gap-3">
          <h2 className="m-0 text-sm font-semibold">ResultRow</h2>
          <Card title="Without a score (as today)" state="row-plain">
            <ul className="m-0 flex list-none flex-col p-0">
              <ResultRow pin={PINS[0]} selected={false} hovered={false} claimId={CLAIM_ID} onSelect={noop} onHover={noop} />
            </ul>
          </Card>
          <Card title="With a score" state="row-score">
            <ul className="m-0 flex list-none flex-col p-0">
              <ResultRow pin={PINS[0]} score={score("9900000101")} selected={false} hovered={false} claimId={CLAIM_ID} onSelect={noop} onHover={noop} />
            </ul>
          </Card>
          <Card title="Stretch by price" state="row-stretch">
            <ul className="m-0 flex list-none flex-col p-0">
              <ResultRow pin={PINS[4]} score={score("9900000105")} selected={false} hovered={false} claimId={CLAIM_ID} onSelect={noop} onHover={noop} />
            </ul>
          </Card>
          <Card title="Stretch by distance, weak" state="row-far">
            <ul className="m-0 flex list-none flex-col p-0">
              <ResultRow pin={PINS[5]} score={score("9900000106")} selected={false} hovered={false} claimId={CLAIM_ID} onSelect={noop} onHover={noop} />
            </ul>
          </Card>
        </div>

        <div className="flex w-full max-w-[400px] flex-col gap-3">
          <h2 className="m-0 text-sm font-semibold">MatchScore (property panel)</h2>
          <Card title="Strong" state="score-strong">
            <MatchScore score={score("9900000101")} />
          </Card>
          <Card title="Fair, stretch by price" state="score-stretch">
            <MatchScore score={score("9900000105")} />
          </Card>
          <Card title="Weak, stretch by distance" state="score-weak">
            <MatchScore score={score("9900000106")} />
          </Card>
          <Card title="No why line" state="score-no-why">
            <MatchScore score={{ ...score("9900000104"), why: null }} />
          </Card>
          <Card title="Loading" state="score-loading">
            <MatchScore score={null} loading />
          </Card>
          <Card title="No score (renders nothing)" state="score-none">
            <MatchScore score={null} />
          </Card>
        </div>
      </div>
    </main>
  );
}
