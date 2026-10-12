"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ApiError, SummaryLogResponse, SummaryResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  claimId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = { kind: "idle" } | { kind: "copied" } | { kind: "logging" } | { kind: "sent"; dryRun: boolean } | { kind: "error"; message: string };

// The preview is the email as the specialist will see it: light, system font, whatever the app theme.
const FRAME_CSS =
  "body{margin:0;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;background:#fff}p{margin:0 0 10px}ul{margin:0 0 10px;padding-left:18px}a{color:#0070f3}";

/**
 * F4 — preview, then hand off to the searcher's own mailbox: copy the formatted summary, open an email
 * addressed to the relocation specialist, and log the summary on the Monday claim.
 */
export default function SummarySheet({ claimId, open, onOpenChange }: Props) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSummary(null);
    setError(null);
    setStep({ kind: "idle" });
    (async () => {
      try {
        const res = await fetch(`/api/claim/${claimId}/summary`, { cache: "no-store" });
        const json = (await res.json()) as SummaryResponse | ApiError;
        if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
        if (!cancelled) setSummary(json as SummaryResponse);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not build the summary");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, claimId]);

  async function copy(s: SummaryResponse) {
    // Rich copy pastes formatted into Gmail/Outlook; plain text is the fallback.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([s.html], { type: "text/html" }),
          "text/plain": new Blob([s.text], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(s.text);
    }
  }

  async function onCopy() {
    if (!summary) return;
    try {
      await copy(summary);
      setStep({ kind: "copied" });
    } catch {
      setStep({ kind: "error", message: "Copy was blocked by the browser. Select the preview text and copy it by hand." });
    }
  }

  async function onEmail() {
    if (!summary) return;
    try {
      await copy(summary);
    } catch {
      // Still open the email; the step message tells them to copy by hand.
    }
    // Addresses come from parseEmails (no reserved characters); left unencoded because some desktop clients don't decode %40.
    const to = summary.recipient.emails.join(",");
    // A link click (not location.href) so it also works when the map is embedded in a Monday iframe.
    const a = document.createElement("a");
    a.href = `mailto:${to}?subject=${encodeURIComponent(summary.subject)}`;
    a.click();

    if (step.kind === "sent") return; // already logged for this summary; just reopen the email
    setStep({ kind: "logging" });
    try {
      const res = await fetch(`/api/claim/${claimId}/summary`, { method: "POST" });
      const json = (await res.json()) as SummaryLogResponse | ApiError;
      if (!res.ok || !("ok" in json)) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
      setStep({ kind: "sent", dryRun: !!json.dryRun });
    } catch (e) {
      setStep({ kind: "error", message: `Email opened, but logging on Monday failed: ${e instanceof Error ? e.message : "unknown error"}` });
    }
  }

  const recipient = summary?.recipient;
  const canEmail = !!recipient && recipient.emails.length > 0 && step.kind !== "logging";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 border-line p-0 sm:max-w-[520px]">
        <SheetHeader className="gap-1 border-b border-line px-4 py-3">
          <SheetTitle className="text-[15px] font-semibold tracking-[-0.01em]">Send summary</SheetTitle>
          <SheetDescription className="text-xs text-muted">
            The options on this claim, for the relocation specialist. Owner contacts are left out.
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div className="m-4 rounded-md border p-3 text-xs" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
            {error}
          </div>
        ) : !summary ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building the summary…
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1.5 border-b border-line px-4 py-3 text-[13px]">
              <dt className="text-muted">To</dt>
              <dd className="min-w-0 truncate">
                {recipient?.emails.length ? (
                  <>
                    {recipient.name && <span className="font-medium">{recipient.name} </span>}
                    <span className="text-muted">{recipient.emails.join(", ")}</span>
                  </>
                ) : (
                  <span style={{ color: "var(--amber-ink)" }}>No specialist email on the claim. Copy the summary and send it yourself.</span>
                )}
              </dd>
              <dt className="text-muted">Subject</dt>
              <dd className="min-w-0 truncate font-medium">{summary.subject}</dd>
            </dl>

            <iframe
              title="Summary preview"
              sandbox=""
              srcDoc={`<!doctype html><meta charset="utf-8"><style>${FRAME_CSS}</style>${summary.html}`}
              className="min-h-0 w-full flex-1 bg-white"
            />

            <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
              {step.kind === "error" && (
                <p className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
                  {step.message}
                </p>
              )}
              {step.kind === "sent" && (
                <p
                  role="status"
                  className="rounded-md border p-2 text-xs"
                  style={{ borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-ink)" }}
                >
                  Summary copied. Paste it into the email and send.{" "}
                  {step.dryRun ? "Dry run: nothing was logged on Monday." : "Logged on the Monday claim."}
                </p>
              )}
              {step.kind === "copied" && (
                <p role="status" className="text-xs text-muted">
                  Copied. Paste it into any email.
                </p>
              )}
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium"
                >
                  {step.kind === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
                </button>
                <button
                  type="button"
                  disabled={!canEmail}
                  onClick={onEmail}
                  className={cn(
                    "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium",
                    canEmail ? "bg-ink text-bg hover:brightness-110" : "cursor-not-allowed bg-surface-muted text-muted",
                  )}
                >
                  {step.kind === "logging" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  <span className="truncate">Email {recipient?.name ?? "specialist"}</span>
                </button>
              </div>
              <p className="text-center text-xs text-muted">
                Copies the summary, opens your email app addressed to the specialist, and notes it on the Monday claim.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
