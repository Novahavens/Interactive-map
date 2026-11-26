"use client";

// Dev-only preview of the claims drawer with Mine / All and the Nearsite tab (never ships: 404 in production).
//
//   /dev/claims-drawer                      both flags on, canned data
//   ?flags=none | mine | nearsite           which features /api/health reports
//   ?nearsite=empty | error | off | slow    what GET /api/claims/nearsite answers
//   ?claims=error                           what GET /api/claims/active answers
//   ?closed=1                               start with the drawer closed (the state gallery is behind it)
//   ?net=1                                  don't answer the three routes here (the browser test mocks them itself)
//
// All data is fictional.
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import ActiveClaimsDrawer from "@/components/ActiveClaimsDrawer";
import NearsiteList, { type NearsiteData } from "@/components/NearsiteList";
import { FEATURE_KEYS } from "@/lib/feature-keys";
import type { ActiveClaim, NearsiteClaim } from "@/lib/types";

const needs = (bedrooms: number | null, bathrooms: number | null, pets: number | null) => ({ adults: 2, children: 1, bedrooms, bathrooms, pets, frv: 3000, moveIn: "2026-12-08" });
const claim = (o: Partial<ActiveClaim> & Pick<ActiveClaim, "id" | "name">): ActiveClaim => ({
  lossAddress: null, lat: null, lng: null, needs: needs(3, 2, null), createdAt: "2026-11-18T15:00:00Z", status: "Working on it",
  attachedCount: 0, group: "New Housing Request", isTest: false, accountManager: null, ...o,
});
const CLAIMS: ActiveClaim[] = [
  claim({ id: "9900000001", name: "Ramirez family", lossAddress: "2207 Cedar Hollow Rd, Tulsa, OK", needs: needs(3, 2, 1), attachedCount: 7, accountManager: "Dana Whitfield" }),
  claim({ id: "9900000002", name: "Okafor household", lossAddress: "88 Quarry Bend Dr, Broken Arrow, OK", needs: needs(4, 3, null), attachedCount: 2, accountManager: "Whitfield, Dana", createdAt: "2026-11-21T15:00:00Z" }),
  claim({ id: "9900000003", name: "Lindqvist, Ada", lossAddress: "410 Peach Orchard Way, Owasso, OK", needs: needs(2, 1, 2), accountManager: "Theo Brandt", createdAt: "2026-11-24T15:00:00Z" }),
  claim({ id: "9900000004", name: "Tran / Nguyen", lossAddress: "19 Harbor Mill Ct, Jenks, OK", attachedCount: 4, accountManager: "Theo Brandt, Dana Whitfield", group: "New Option Needed", createdAt: "2026-11-25T15:00:00Z" }),
  claim({ id: "9900000005", name: "Abernathy, Joel", needs: needs(null, null, null), createdAt: "2026-11-26T15:00:00Z" }),
  claim({ id: "9900000006", name: "Vasquez family with a very long claim name that has to truncate", lossAddress: "7 Pretend Pl, Sand Springs, OK 74063", attachedCount: 1, accountManager: "Theo Brandt" }),
];
const TEST_CLAIM = claim({ id: "9900000099", name: "Demo Family — Test", lossAddress: "100 Demo Street, Tulsa, OK", isTest: true, group: "Test", accountManager: "Dana Whitfield" });

const ns = (o: Partial<NearsiteClaim> & Pick<NearsiteClaim, "id" | "title">): NearsiteClaim => ({
  mondayItemId: `99000003${o.id.slice(-2)}`, company: "Example Mutual", city: null, state: "OK", lat: 36.15, lng: -95.99, lossAddress: null,
  beds: 3, baths: 2, budgetMonthly: null, maxRate: null, moveIn: "2026-12-08", daysLeft: null, feeGroup: null, homesFound: null,
  status: "Open", assignedTo: null, url: null, ...o,
});
const NEARSITE: NearsiteClaim[] = [
  ns({ id: "90001", title: "Mbeki household", city: "Claremore", beds: 3, baths: 2, budgetMonthly: 2900, daysLeft: 12, feeGroup: "C", homesFound: 6, assignedTo: "Dana Whitfield" }),
  ns({ id: "90002", title: "Castellanos family", city: "Sand Springs", beds: 4, baths: 2, budgetMonthly: 3600, daysLeft: 2, feeGroup: "B", homesFound: 3 }),
  ns({ id: "90003", title: "Yamada family", city: "Skiatook", beds: 4, baths: 3, budgetMonthly: 4100, daysLeft: 21, feeGroup: "C", homesFound: 0, assignedTo: "Theo Brandt" }),
  ns({ id: "90004", title: "Sorensen, Lars", city: "Sapulpa", beds: 3, baths: 1, daysLeft: 0, feeGroup: "A", homesFound: 1, assignedTo: "Theo Brandt" }),
  ns({ id: "90005", title: "Hartwell, Priya", city: "Bixby", beds: 2, baths: 2, budgetMonthly: 2400, daysLeft: 9, feeGroup: "A", homesFound: 0 }),
  ns({ id: "90006", title: "Delacroix, Inès", city: "Glenpool", beds: 1, baths: 1, budgetMonthly: 1800, mondayItemId: null, lat: null, lng: null }),
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Answers the drawer's three routes from the consts above. Must be in place before the drawer's first effect. */
function installRoutes(q: URLSearchParams) {
  const w = window as typeof window & { __nhPreviewRoutes?: boolean };
  if (w.__nhPreviewRoutes || q.get("net") === "1") return;
  w.__nhPreviewRoutes = true;
  const flags = q.get("flags") ?? "mine,nearsite";
  const on = new Set(flags === "all" ? FEATURE_KEYS : flags.split(","));
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.pathname === "/api/health") {
      return json({ ok: true, dryRun: true, quo: false, editing: false, features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, on.has(k)])) });
    }
    if (url.pathname === "/api/claims/active") {
      if (q.get("claims") === "error") return json({ error: "Monday did not answer", code: "monday_error" }, 502);
      const claims = url.searchParams.get("includeTest") === "1" ? [...CLAIMS, TEST_CLAIM] : CLAIMS;
      return json({ claims, count: claims.length });
    }
    if (url.pathname === "/api/claims/nearsite") {
      const mode = q.get("nearsite");
      if (mode === "slow") await new Promise((r) => setTimeout(r, 60_000));
      if (mode === "error") return json({ error: "Could not read the Nearsite claims", code: "db_error" }, 502);
      if (mode === "off" || !on.has("nearsite")) return json({ enabled: false, claims: [] });
      return json({ enabled: true, claims: mode === "empty" ? [] : NEARSITE });
    }
    return real(input, init);
  };
}

const still = (o: Partial<NearsiteData>): NearsiteData => ({ claims: NEARSITE, loading: false, error: null, off: false, reload: async () => {}, ...o });
const GALLERY: { title: string; data: NearsiteData; scope?: "mine" | "all"; name?: string }[] = [
  { title: "Rows · All · soonest first", data: still({}) },
  { title: "Rows · Mine (Dana) = mine + free for all", data: still({}), scope: "mine", name: "Dana" },
  { title: "Loading", data: still({ claims: null, loading: true }) },
  { title: "Empty", data: still({ claims: [] }) },
  { title: "Error", data: still({ claims: null, error: "Could not read the Nearsite claims" }) },
  { title: "Error after a good read (Refresh failed)", data: still({ error: "Could not read the Nearsite claims" }) },
  { title: "Mine · nothing for this name", data: still({ claims: NEARSITE.filter((c) => c.assignedTo) }), scope: "mine", name: "Alex Example" },
  { title: "Off (renders nothing)", data: still({ claims: [], off: true }) },
];

const LINKS: [string, string][] = [
  ["Both on", "?"],
  ["Flags off (today's drawer)", "?flags=none"],
  ["Mine only", "?flags=mine"],
  ["Nearsite only", "?flags=nearsite"],
  ["Nearsite empty", "?nearsite=empty"],
  ["Nearsite error", "?nearsite=error"],
  ["Nearsite loading", "?nearsite=slow"],
  ["Nearsite off on the server", "?nearsite=off"],
  ["Claims error", "?claims=error"],
];

export default function ClaimsDrawerPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>("9900000001");
  const [log, setLog] = useState<string[]>([]);
  const [name, setName] = useState("");
  const say = (line: string) => setLog((l) => [...l, line]);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    installRoutes(q);
    setName(localStorage.getItem("nh-reporter-name") ?? "");
    setOpen(q.get("closed") !== "1");
    setReady(true); // the drawer mounts only now, so its first requests go through installRoutes
  }, []);

  const remember = (value: string | null) => {
    if (value) localStorage.setItem("nh-reporter-name", value);
    else localStorage.removeItem("nh-reporter-name");
    localStorage.removeItem("nh-claims-scope");
    location.reload();
  };
  const flipTheme = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("nh-theme", next);
  };
  const btn = "inline-flex h-8 items-center rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink";

  return (
    <main className="min-h-dvh bg-bg p-4 text-sm text-ink">
      <h1 className="text-[15px] font-semibold">Claims drawer · Mine / All · Nearsite tab</h1>
      <p className="mt-1 text-xs text-muted">Dev preview. Fictional data. Name on this device: {name ? <b className="font-medium text-ink">{name}</b> : "none"}.</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className={btn} onClick={() => setOpen(true)} data-testid="open-drawer">
          Open drawer
        </button>
        <button type="button" className={btn} onClick={flipTheme}>
          Theme
        </button>
        <button type="button" className={btn} onClick={() => remember("Dana Whitfield")}>
          Remember “Dana Whitfield”
        </button>
        <button type="button" className={btn} onClick={() => remember("Nobody Here")}>
          Remember “Nobody Here”
        </button>
        <button type="button" className={btn} onClick={() => remember(null)}>
          Forget the name
        </button>
      </div>
      <nav className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]" aria-label="Preview states">
        {LINKS.map(([label, href]) => (
          <a key={href} href={`/dev/claims-drawer${href}`} className="text-focus underline-offset-2 hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <h2 className="nh-eyebrow mt-5">What the drawer called</h2>
      <ol className="mt-1 min-h-6 list-decimal pl-5 font-mono text-xs" data-testid="log">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>

      <h2 className="nh-eyebrow mt-5">NearsiteList, every state</h2>
      <div className="mt-2 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),360px))]">
        {GALLERY.map((g) => (
          <figure key={g.title} data-gallery={g.title}>
            <div className="flex h-[420px] flex-col overflow-hidden rounded-[10px] border border-line2 bg-surface">
              <NearsiteList data={g.data} scope={g.scope} name={g.name} onShowAll={() => say("showAll (gallery)")} onSelectNearsite={(c) => say(`nearsite ${c.id} ${c.assignedTo ? "open" : "pickup"} (gallery)`)} selectedId="9900000302" />
            </div>
            <figcaption className="mt-1 text-xs text-muted">{g.title}</figcaption>
          </figure>
        ))}
      </div>

      {ready && (
        <ActiveClaimsDrawer
          open={open}
          onOpenChange={setOpen}
          selectedId={selectedId}
          onSelect={(c) => {
            setSelectedId(c.id);
            say(`claim ${c.id}`);
          }}
          onCount={(n) => document.documentElement.setAttribute("data-claim-count", String(n))}
          onSelectNearsite={(c) => {
            setSelectedId(c.mondayItemId ?? c.id);
            say(`nearsite ${c.id} ${c.assignedTo ? "open" : "pickup"}`);
          }}
        />
      )}
    </main>
  );
}
