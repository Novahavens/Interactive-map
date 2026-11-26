"use client";

// Dev-only preview of the claims-agent cockpit (flag `agentGraph`): the claim line with and without Submit, and
// the panel step in each state a person can act on. All data is fictional. Never ships: 404 in production.
// tests/browser/agent-graph.mjs drives it; the event POSTs go to /api/claim/:id/agent/event, mocked there.
import { notFound } from "next/navigation";
import { toAgentState, type AgentHome } from "@/lib/agent-graph";
import ClaimAgentLine from "@/components/ClaimAgentLine";
import AgentStep, { type AgentSend } from "@/components/property/AgentStep";

const CLAIM_ID = "9900000001";
const DRAFT =
  "Hi! This is the housing team at Nova Havens. We place families who've been displaced from their homes (insurance-covered stays, paid on time, fully vetted). Your home could be a great fit for a family of 2 adults and 1 dog, from Dec 8, 2026 to Mar 8, 2027. Is it available for those dates?";

const h = (status: string, label: string, waitingOn: string | null = null, draft: string | null = null): AgentHome => ({ status, label, waitingOn, draft });
const HOMES: Record<string, AgentHome> = {
  "9900000101": h("suggested", "Suggested: 92 points", "a person to tick or X"),
  "9900000102": h("accepted", "Accepted: ready to message", null, DRAFT),
  "9900000103": h("messaged", "Messaged the landlord", "the landlord's reply", DRAFT),
  "9900000104": h("needs_person", "Needs a person", "someone to call the landlord"),
  "9900000105": h("verified", "Verified on a call"),
  "9900000106": h("ready", "Ready: checker passed"),
};
const state = (stage: string, label: string, waiting: string | null) =>
  toAgentState({ ok: true, claim_key: `nearsite:${CLAIM_ID}`, state: { stage, label, waiting_on: waiting, homes: HOMES, held: [] } });

const send: AgentSend = async (ev) => {
  const res = await fetch(`/api/claim/${CLAIM_ID}/agent/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev) });
  return res.ok;
};

export default function AgentGraphPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const box = "flex w-full max-w-[400px] flex-col gap-1.5 rounded-lg border border-line bg-surface p-3";
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-bg p-4 text-ink">
      <h1 className="text-lg font-semibold">Claims agent: cockpit preview</h1>
      <section data-group="claim" className="flex flex-wrap gap-4">
        <div data-case="claim-ready" className={box}>
          <ClaimAgentLine state={state("ready", "Ready to submit", null)} send={send} />
        </div>
        <div data-case="claim-sourcing" className={box}>
          <ClaimAgentLine state={state("contacting", "Contacting landlords", "3 landlord replies")} send={send} />
        </div>
        <div data-case="claim-none" className={box}>
          <ClaimAgentLine state={toAgentState({ ok: true, claim_key: null, state: null })} send={send} />
          <span className="text-xs text-muted">(not running: nothing drawn)</span>
        </div>
      </section>
      <section data-group="homes" className="flex flex-wrap gap-4">
        {Object.entries(HOMES).map(([k, home]) => (
          <div key={k} data-case={`home-${home.status}`} className={box}>
            <AgentStep home={home} homeKey={k} listingUrl="https://example.com/ff/sample-listing" send={send} />
          </div>
        ))}
        <div data-case="home-none" className={box}>
          <AgentStep home={null} homeKey="9900000199" listingUrl={null} send={send} />
        </div>
      </section>
    </main>
  );
}
