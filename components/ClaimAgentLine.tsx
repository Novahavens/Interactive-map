"use client";

import { useState } from "react";
import { canSubmit, claimCounts, type AgentState } from "@/lib/agent-graph";
import type { AgentSend } from "./property/AgentStep";

/**
 * The claim's place on the agent's graph (flag `agentGraph`), under the claim brief, with the Submit button once
 * a home has passed the checker. Pressing Submit only asks: William and Lou still approve in Slack first.
 */
export default function ClaimAgentLine({ state, send }: { state: AgentState; send: AgentSend }) {
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!state.claimKey || !state.label) return null;
  const n = claimCounts(state);
  const bits = [`${n.homes} home${n.homes === 1 ? "" : "s"}`];
  if (n.needYou) bits.push(`${n.needYou} need${n.needYou === 1 ? "s" : ""} you`);
  if (n.ready) bits.push(`${n.ready} ready`);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line2 p-2" data-agent-claim={state.stage}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">Agent: {state.label}</span>
        <span className="text-xs text-muted">{bits.join(" · ")}</span>
      </div>
      {state.waitingOn && <p className="m-0 text-xs text-muted">Waiting on {state.waitingOn}</p>}
      {canSubmit(state) && (
        <button
          type="button"
          disabled={busy || asked}
          onClick={async () => {
            setBusy(true);
            setAsked(await send({ type: "submit_pressed" }));
            setBusy(false);
          }}
          className="inline-flex h-8 pointer-coarse:h-11 items-center justify-center rounded-md bg-ink px-3 text-[12.5px] font-medium text-bg disabled:opacity-60"
        >
          {asked ? "Sent for William and Lou to approve" : "Submit for approval"}
        </button>
      )}
    </div>
  );
}
