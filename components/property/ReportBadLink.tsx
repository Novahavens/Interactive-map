"use client";

import { useRef, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import type { ApiError, FlagLinkRequest, FlagLinkResponse } from "@/lib/types";

const REPORTER_KEY = "nh-reporter-name";

/** What the report did: flagged with the Monday note, flagged without it, or it was already flagged. */
export type Reported = "noted" | "unnoted" | "already";

type ReportState = { kind: "closed" } | { kind: "open" } | { kind: "sending" } | { kind: "error"; message: string };

function readReporterName(): string {
  try {
    return localStorage.getItem(REPORTER_KEY) ?? "";
  } catch {
    return "";
  }
}

function errorCopy(status: number, json: ApiError | null): string {
  if (status === 429) return "Too many reports right now; try again in a few minutes.";
  if (status === 400 && /link|url/i.test(`${json?.code ?? ""} ${json?.error ?? ""}`)) return "Links are not allowed in the note.";
  return json?.error || `HTTP ${status}`;
}

export function ReportBadLink({ propertyId, onReported }: { propertyId: string; onReported: (r: Reported) => void }) {
  const [state, setState] = useState<ReportState>({ kind: "closed" });
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function show() {
    const saved = readReporterName();
    setName(saved);
    setState({ kind: "open" });
    requestAnimationFrame(() => (saved ? noteRef : nameRef).current?.focus());
  }

  function cancel() {
    setState({ kind: "closed" });
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    const body: FlagLinkRequest = {};
    if (name.trim()) body.reportedBy = name.trim();
    if (note.trim()) body.note = note.trim();
    try {
      const res = await fetch(`/api/properties/${propertyId}/flag-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as (FlagLinkResponse & { noted?: boolean }) | ApiError | null;
      if (res.status === 409) return onReported("already");
      if (!res.ok || !json || !("ok" in json)) throw new Error(errorCopy(res.status, json as ApiError | null));
      try {
        if (name.trim()) localStorage.setItem(REPORTER_KEY, name.trim());
      } catch {
        // private window or blocked storage: the report still went through
      }
      onReported(json.alreadyFlagged ? "already" : json.noted ? "noted" : "unnoted");
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not send the report" });
    }
  }

  if (state.kind === "closed") {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={show}
        className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-xs font-medium text-muted hover:text-ink"
      >
        <Flag className="h-3 w-3" aria-hidden="true" />
        Report bad link
      </button>
    );
  }

  const sending = state.kind === "sending";
  return (
    <form
      onSubmit={send}
      onKeyDown={(e) => e.key === "Escape" && !sending && cancel()}
      className="mt-2 flex flex-col gap-2 rounded-md border border-line bg-surface-muted p-2.5 text-[13px]"
      aria-label="Report bad link"
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Your name</span>
        <input
          ref={nameRef}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="h-8 rounded-md border border-line2 bg-surface px-2 text-ink"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">What&apos;s wrong? (optional)</span>
        <textarea
          ref={noteRef}
          value={note}
          maxLength={300}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="resize-none rounded-md border border-line2 bg-surface px-2 py-1.5 text-ink"
        />
      </label>
      {state.kind === "error" && (
        <p role="alert" className="text-xs" style={{ color: "var(--bad-ink)" }}>
          <span className="font-medium">Not sent.</span> {state.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-xs font-medium text-bg hover:brightness-110 disabled:opacity-60"
        >
          {sending && <Loader2 className="h-3 w-3 animate-spin" />}
          Send
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={sending}
          className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ReportedNote({ reported }: { reported: Reported }) {
  return (
    <p role="status" className="mt-2 text-xs text-muted">
      {reported === "already" ? (
        <span className="font-medium text-ink">Already reported.</span>
      ) : reported === "noted" ? (
        <>
          <span className="font-medium text-ink">Reported. Thanks.</span> A note was added to the property on Monday.
        </>
      ) : (
        <span className="font-medium text-ink">Reported. (The Monday note could not be added.)</span>
      )}
    </p>
  );
}
