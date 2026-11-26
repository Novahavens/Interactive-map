// Claims agent graph on the map (flag `agentGraph`): the pure half. The agent (agent/ in this repo) keeps every
// claim on a state graph and writes a short projection to agent_state; the map reads it through
// map_agent_state() and sends what people decide (tick or X, Submit, send back) through map_agent_event().
// No I/O and only type imports, so `npm run test:unit` covers every rule here.

export type AgentEventType = "human_pick" | "submit_pressed" | "person_action";

export interface AgentHome {
  status: string;
  label: string;
  waitingOn: string | null;
  /** The landlord message the agent drafted for this home (in-app send through the extension). */
  draft: string | null;
}

export interface AgentState {
  enabled: boolean;
  /** Claim key, e.g. "nearsite:90003" or "monday:1234567890". Null: the agent isn't running this claim. */
  claimKey: string | null;
  stage: string | null;
  label: string | null;
  waitingOn: string | null;
  homes: Record<string, AgentHome>;
  held: number;
}

export const NO_AGENT: AgentState = Object.freeze({ enabled: false, claimKey: null, stage: null, label: null, waitingOn: null, homes: {}, held: 0 }) as AgentState;

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** map_agent_state's answer -> AgentState. Anything malformed reads as "not running". */
export function toAgentState(data: unknown): AgentState {
  if (!isRow(data) || data.ok !== true || !isRow(data.state)) return { ...NO_AGENT, enabled: true };
  const s = data.state;
  const homes: Record<string, AgentHome> = {};
  if (isRow(s.homes)) {
    for (const [k, h] of Object.entries(s.homes)) {
      if (!isRow(h) || !str(h.status)) continue;
      homes[k] = { status: String(h.status), label: str(h.label) ?? String(h.status), waitingOn: str(h.waiting_on), draft: str(h.draft) };
    }
  }
  return {
    enabled: true,
    claimKey: str(data.claim_key),
    stage: str(s.stage),
    label: str(s.label),
    waitingOn: str(s.waiting_on),
    homes,
    held: Array.isArray(s.held) ? s.held.length : 0,
  };
}

/** What a person can do to a home in this status. */
export function homeActions(status: string | null | undefined): { pick: boolean; message: boolean; sendBack: boolean } {
  return {
    pick: status === "suggested",
    message: status === "accepted" || status === "messaged",
    sendBack: status === "needs_person",
  };
}

/** Submit is offered only when the claim is ready (a home passed the checker). */
export const canSubmit = (st: AgentState) => st.enabled && st.stage === "ready";

const HOME_KEY_RE = /^[A-Za-z0-9:_-]{1,80}$/;
const RESUME_TO = new Set(["messaged", "ok_to_call", "called", "verified"]);

/** Validates a POST body from the panel. Returns the event or an error message. */
export function parseAgentEvent(body: unknown): { ok: true; type: AgentEventType; homeKey: string | null; payload: Row } | { ok: false; error: string } {
  if (!isRow(body)) return { ok: false, error: "Expected a JSON object" };
  const type = body.type;
  if (type === "submit_pressed") return { ok: true, type, homeKey: null, payload: {} };
  const homeKey = str(body.homeKey);
  if (!homeKey || !HOME_KEY_RE.test(homeKey)) return { ok: false, error: "Invalid home" };
  if (type === "human_pick") {
    if (body.decision !== "accept" && body.decision !== "decline") return { ok: false, error: "decision must be accept or decline" };
    return { ok: true, type, homeKey, payload: { decision: body.decision } };
  }
  if (type === "person_action") {
    if (body.action === "drop") return { ok: true, type, homeKey, payload: { action: "drop" } };
    if (body.action === "resume" && typeof body.resumeTo === "string" && RESUME_TO.has(body.resumeTo))
      return { ok: true, type, homeKey, payload: { action: "resume", resume_to: body.resumeTo } };
    return { ok: false, error: "action must be drop, or resume with a step" };
  }
  return { ok: false, error: "Unknown action" };
}

/** The home a person sees in the panel: the agent's step for it, or null when the agent hasn't got it. */
export function homeStep(st: AgentState | null, propertyId: string | null | undefined): AgentHome | null {
  if (!st?.enabled || !propertyId) return null;
  return st.homes[propertyId] ?? null;
}

/** Counts for the claim line: homes the agent is working, waiting on a person, and ready to submit. */
export function claimCounts(st: AgentState): { homes: number; needYou: number; ready: number } {
  const hs = Object.values(st.homes);
  return {
    homes: hs.length,
    needYou: hs.filter((h) => h.status === "suggested" || h.status === "needs_person").length,
    ready: hs.filter((h) => h.status === "ready").length,
  };
}
