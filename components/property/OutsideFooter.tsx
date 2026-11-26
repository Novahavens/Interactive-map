"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Check, Loader2, MessageSquare, Plus } from "lucide-react";
import type { AddOutsideResponse, ApiError, OutsideHome, SubmitStatus as SubmitStatusRow } from "@/lib/types";
import { addedLine } from "@/lib/submit-status";
import { cn, MONDAY_BOARDS, mondayItemUrl } from "@/lib/utils";
import { readReporterName } from "./ReportBadLink";
import SubmitStatus from "./SubmitStatus";

type AddState =
  | { kind: "idle" }
  | { kind: "adding" }
  | { kind: "done"; at: Date; by: string }
  | { kind: "already" }
  | { kind: "dry" }
  | { kind: "blocked" }
  | { kind: "error"; message: string };

export interface OutsideFooterProps {
  home: OutsideHome;
  claim: { id: string; name: string; accountManager: string | null } | null;
  /** Flag `addOutside`. False: no Add button at all (a home already on the claim still says so). */
  canAdd: boolean;
  /** After Monday took it (201) or said it was already there (200). Not called for a dry run. */
  onAdded: (home: OutsideHome, res: AddOutsideResponse) => void;
  /** Opens the "Ask for the address" text. Pass it only when there is a number to text: without it the shortcut is not drawn. */
  onAskAddress?: () => void;
  /** This home's submit step, once it is on the claim (flag `submit`). Left out: no steps. Null: no row yet, which reads "To Do" right after an add. */
  submit?: SubmitStatusRow | null;
  /** Who is adding (sent as `user`). Defaults to the name remembered on this device. */
  user?: string;
}

const NOTE = "flex items-start gap-2 rounded-md border p-2 text-xs";

/** Footer of the panel for a home that is not in our database yet: Add to claim (which also saves the home), and what came of it. */
export default function OutsideFooter({ home, claim, canAdd, onAdded, onAskAddress, submit, user }: OutsideFooterProps) {
  // The panel is keyed by claim + home, so a switch unmounts it; this stops a late answer landing in the next one.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [add, setAdd] = useState<AddState>({ kind: "idle" });

  async function handleAdd() {
    if (!claim || !canAdd || add.kind === "adding") return;
    const by = (user ?? readReporterName()).trim();
    setAdd({ kind: "adding" });
    try {
      const res = await fetch(`/api/claim/${encodeURIComponent(claim.id)}/add-outside`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: home.listingId, user: by || undefined }),
      });
      const json = (await res.json().catch(() => null)) as AddOutsideResponse | ApiError | null;
      if (!alive.current) return;
      if (res.status === 409 && json && "code" in json && json.code === "no_address") {
        setAdd({ kind: "blocked" });
        return;
      }
      if (!res.ok || !json || !("ok" in json)) throw new Error((json as ApiError | null)?.error || `HTTP ${res.status}`);
      if (json.dryRun) {
        setAdd({ kind: "dry" });
        return;
      }
      setAdd(json.alreadyOnClaim ? { kind: "already" } : { kind: "done", at: new Date(), by });
      onAdded(home, json);
    } catch (e) {
      if (!alive.current) return;
      setAdd({ kind: "error", message: e instanceof Error && e.message ? e.message : "Add to claim failed" });
    }
  }

  const onClaim = home.onClaim || add.kind === "done" || add.kind === "already";
  // With the feature off there is nothing to offer; a home that is already on the claim still says so.
  if (!canAdd && !onClaim) return null;

  const blocked = !home.addressKnown || add.kind === "blocked";
  const disabledReason = !claim ? "Pick a claim from Claims (Ctrl/⌘ K) to attach properties" : null;
  const state = onClaim ? (add.kind === "done" ? "done" : "on-claim") : !claim ? "no-claim" : blocked ? "blocked" : add.kind;
  const monday = (
    <a href={mondayItemUrl(MONDAY_BOARDS.claim, claim?.id)} target="_blank" rel="noreferrer noopener" className="no-underline">
      Monday →
    </a>
  );

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 py-3" data-outside-footer={state}>
      {/* Always mounted so a screen reader hears what the add did. */}
      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {add.kind === "error" && !onClaim && (
          <div className="rounded-md border border-bad-line bg-bad-bg p-2 text-xs text-bad-ink">
            <span className="font-medium">Not added.</span> {add.message}
          </div>
        )}
        {add.kind === "dry" && !onClaim && (
          <div className="rounded-md border border-line bg-surface-muted p-2 text-xs text-ink">
            <span className="font-medium">Dry run: nothing was added.</span> Monday and our database were not changed.
          </div>
        )}
      </div>

      {!onClaim ? (
        <>
          {claim && (
            <p className="truncate text-xs text-muted">
              Adding to: <span className="font-medium text-ink">{claim.name}</span>
              {claim.accountManager && <span> · {claim.accountManager}</span>}
            </p>
          )}
          {claim && blocked && (
            <div className={cn(NOTE, "border-amber-line bg-amber-bg text-amber-ink")} role={add.kind === "blocked" ? "alert" : undefined}>
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold">Ask the landlord for the address first.</span> We can&apos;t add a home without a street address.
              </span>
            </div>
          )}
          <button
            type="button"
            disabled={!!disabledReason || blocked || add.kind === "adding"}
            onClick={() => void handleAdd()}
            className={cn(
              "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition [@media(pointer:coarse)]:h-[44px]",
              disabledReason || blocked ? "cursor-not-allowed bg-surface-muted text-muted" : "bg-ink text-bg hover:brightness-110 active:brightness-95",
            )}
          >
            {add.kind === "adding" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Adding to claim…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add to claim
              </>
            )}
          </button>
          {claim && blocked ? (
            onAskAddress && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onAskAddress}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-surface-muted [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:px-3"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Text: Ask for the address
                </button>
              </div>
            )
          ) : (
            <p className="text-center text-xs text-muted">{disabledReason ?? "Also saves this home to our database. Starts as “To Do”."}</p>
          )}
        </>
      ) : (
        <>
          <div
            role="status"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-ok-line bg-ok-bg text-sm font-medium text-ok-ink"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> On this claim
          </div>
          {submit !== undefined && (
            <SubmitStatus
              status={
                submit ??
                (add.kind === "done"
                  ? { subitemId: "", propertyId: null, state: "todo", reason: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null }
                  : null)
              }
            />
          )}
          <p className="text-center text-xs text-muted">
            {add.kind === "done" ? (
              <>
                {addedLine(add.at, add.by)} · saved to our database · {monday}
              </>
            ) : (
              <>Already an option on this claim · {monday}</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
