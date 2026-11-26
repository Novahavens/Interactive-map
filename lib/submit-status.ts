import type { SubmitState, SubmitStatus } from "./types";

// The submit line under a home that is on the claim: To Do → Ready to Submit → Option Submitted, or blocked.
// Pure (no DOM, no fetch): the component in components/property/SubmitStatus.tsx only draws what this says.

export type SubmitStepKey = "todo" | "ready" | "submitted";

export const SUBMIT_STEPS: readonly { key: SubmitStepKey; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "ready", label: "Ready to Submit" },
  { key: "submitted", label: "Option Submitted" },
];

export interface SubmitStep {
  key: SubmitStepKey;
  label: string;
  /** done = behind us, now = the current step, later = not reached. */
  phase: "done" | "now" | "later";
  /** What the dot shows: a tick for finished work, otherwise the step number. */
  mark: string;
}

const isStep = (s: unknown): s is SubmitStepKey => s === "todo" || s === "ready" || s === "submitted";

/** The three steps for a state; null for blocked or anything unknown (the steps are then not drawn). */
export function submitSteps(state: SubmitState | string | null | undefined): SubmitStep[] | null {
  if (!isStep(state)) return null;
  const at = SUBMIT_STEPS.findIndex((s) => s.key === state);
  return SUBMIT_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    phase: i < at ? "done" : i === at ? "now" : "later",
    // The last step is finished work the moment it is current, so it shows a tick too.
    mark: i < at || (i === at && s.key === "submitted") ? "✓" : String(i + 1),
  }));
}

/** "Submit status: Ready to Submit, step 2 of 3"; null when there are no steps to name. */
export function submitAriaLabel(state: SubmitState | string | null | undefined): string | null {
  if (!isStep(state)) return null;
  const at = SUBMIT_STEPS.findIndex((s) => s.key === state);
  return `Submit status: ${SUBMIT_STEPS[at].label}, step ${at + 1} of ${SUBMIT_STEPS.length}`;
}

/** "Nov 25" from a date or a timestamp, in the reader's own time zone; "" when it can't be read. */
export function submitDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const clean = (s: string | null | undefined) => (s ?? "").trim();
const join = (parts: string[]) => parts.filter(Boolean).join(" · ");

/**
 * The line under the steps: "Approved by Theo Brandt · Nov 25" when ready,
 * "Submitted Nov 26 · approved by Theo Brandt" when submitted. Null when there is nothing to say
 * (To Do, blocked, or nobody has approved yet).
 */
export function submitLine(status: SubmitStatus | null | undefined): string | null {
  if (!status) return null;
  const approver = clean(status.approvedBy);
  if (status.state === "ready") {
    return approver ? join([`Approved by ${approver}`, submitDate(status.approvedAt)]) : null;
  }
  if (status.state === "submitted") {
    const day = submitDate(status.submittedAt);
    const line = join([day ? `Submitted ${day}` : "", approver ? `approved by ${approver}` : ""]);
    if (!line) return null;
    return line.charAt(0).toUpperCase() + line.slice(1);
  }
  return null;
}

/** The red note that replaces the steps. `head` is the bold part. */
export function blockedText(status: Pick<SubmitStatus, "reason" | "submittedAt">): { head: string; body: string } {
  const raw = clean(status.reason).replace(/[.\s]+$/, "");
  const code = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (code === "claim_closed") return { head: "Blocked: claim closed.", body: "This home can't be submitted." };
  if (code === "already_submitted") {
    const day = submitDate(status.submittedAt);
    return { head: "Blocked: already submitted.", body: day ? `This home was sent on ${day}.` : "This home was already sent." };
  }
  if (!raw) return { head: "Blocked.", body: "This home can't be submitted." };
  // A sentence from the back end: lower its first letter so it reads on after "Blocked:", but leave "FRV …" alone.
  const text = /^[A-Z][a-z]/.test(raw) ? raw.charAt(0).toLowerCase() + raw.slice(1) : raw;
  return { head: `Blocked: ${text}.`, body: "This home can't be submitted." };
}

/**
 * The claim's count line: "3 ready · 2 submitted". With `options` known and zero: "No options yet".
 * Null when there are no counts (feature off or not loaded): draw nothing.
 */
export function submitCountsLabel(
  counts: { ready: number; submitted: number; options?: number | null } | null | undefined,
): string | null {
  if (!counts) return null;
  if (counts.options === 0) return "No options yet";
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  // Nothing moved yet: say how many are waiting ("4 to do") rather than "0 ready · 0 submitted", which also kept
  // squeezing the card's title on the rail.
  if (n(counts.ready) === 0 && n(counts.submitted) === 0 && n(counts.options) > 0) return `${n(counts.options)} to do`;
  return `${n(counts.ready)} ready · ${n(counts.submitted)} submitted`;
}

/** Who added it, for "Added Nov 26 by Dana": the first name only. "" when no name is remembered. */
export function firstName(name: string | null | undefined): string {
  return clean(name).split(/\s+/)[0] ?? "";
}

/** "Added Nov 26 by Dana" / "Added Nov 26". */
export function addedLine(at: Date | string, by: string | null | undefined): string {
  const day = typeof at === "string" ? submitDate(at) : at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const who = firstName(by);
  return ["Added", day, who ? `by ${who}` : ""].filter(Boolean).join(" ");
}
