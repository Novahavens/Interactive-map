"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Check, Loader2, Ban } from "lucide-react";
import type { ApiError, ClaimOption, PropertyDetail } from "@/lib/types";
import { reasonText, type MapStatus } from "@/lib/status";
import { cn, MONDAY_BOARDS, mondayItemUrl } from "@/lib/utils";

type AddState = { kind: "idle" } | { kind: "adding" } | { kind: "done"; subitemId: string } | { kind: "error"; message: string };

interface Props {
  propertyId: string;
  detail: PropertyDetail | null;
  status: MapStatus;
  claim: { id: string; name: string; accountManager: string | null } | null;
  otherClaims: ClaimOption[];
  attached: boolean;
  onAttached: (propertyId: string, subitemId: string) => void;
}

/** Add to claim, with the already-on-another-claim confirm. Call and Text sit by each number in the Contacts card. */
export default function PanelFooter({ propertyId, detail, status, claim, otherClaims, attached, onAttached }: Props) {
  // The panel is keyed by claim + property, so a claim switch unmounts it; this stops a late
  // add response from reporting into the next claim's state.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [add, setAdd] = useState<AddState>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  function requestAdd() {
    if (otherClaims.length > 0) setConfirming(true);
    else void handleAdd();
  }

  async function handleAdd() {
    if (!claim || !detail || add.kind === "adding") return;
    setConfirming(false);
    setAdd({ kind: "adding" });
    try {
      const res = await fetch("/api/claim/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: claim.id, propertyId }),
      });
      const json = (await res.json()) as { ok: true; subitemId: string; alreadyAttached: boolean } | ApiError;
      if (!res.ok || !("ok" in json)) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
      if (!alive.current) return;
      setAdd({ kind: "done", subitemId: json.subitemId });
      onAttached(propertyId, json.subitemId);
    } catch (e) {
      if (!alive.current) return;
      setAdd({ kind: "error", message: e instanceof Error ? e.message : "Add to claim failed" });
    }
  }

  const isAttached = attached || add.kind === "done";
  const addDisabledReason = !claim
    ? "Pick a claim from Claims (Ctrl/⌘ K) to attach properties"
    : status === "red"
      ? `${reasonText(detail?.map_reason)}, so it cannot be attached`
      : isAttached
        ? "Already on this claim"
        : null;

  return (
    <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 py-3">
      {add.kind === "error" && (
        <div className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
          <span className="font-medium">Not added.</span> {add.message}
        </div>
      )}

      {!isAttached ? (
        <>
          {claim && (
            <p className="truncate text-xs text-muted">
              Adding to: <span className="font-medium text-ink">{claim.name}</span>
              {claim.accountManager && <span> · {claim.accountManager}</span>}
            </p>
          )}
          {confirming && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border p-2.5 text-[13px]"
              style={{ borderColor: "var(--amber-line)", background: "var(--amber-bg)", color: "var(--amber-ink)" }}
            >
              <p>
                Already an option on{" "}
                {otherClaims.map((c, i) => (
                  <span key={c.subitemId}>
                    {i > 0 && ", "}
                    <span className="font-medium">{c.claimName}</span>
                    {c.status ? ` (${c.status})` : ""}
                  </span>
                ))}
                . Add anyway?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-ink text-[13px] font-medium text-bg hover:brightness-110"
                >
                  Add anyway
                </button>
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface text-[13px] font-medium text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={!detail || !!addDisabledReason || add.kind === "adding" || confirming}
            onClick={requestAdd}
            className={cn(
              "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition",
              addDisabledReason ? "cursor-not-allowed bg-surface-muted text-muted" : "bg-ink text-bg hover:brightness-110 active:brightness-95",
            )}
          >
            {add.kind === "adding" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding to claim…
              </>
            ) : status === "red" ? (
              <>
                <Ban className="h-3.5 w-3.5" /> DO NOT USE
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Add to claim
              </>
            )}
          </button>
          <p className="text-center text-xs text-muted">
            {addDisabledReason ?? "One sub-item, status “To Do”. One at a time is the quality gate."}
          </p>
        </>
      ) : (
        <>
          <div
            role="status"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium"
            style={{ borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-ink)" }}
          >
            <Check className="h-3.5 w-3.5" /> On this claim
          </div>
          <p className="text-center text-xs text-muted">
            Sub-item created · “To Do” ·{" "}
            <a
              href={mondayItemUrl(MONDAY_BOARDS.claim, claim?.id)}
              target="_blank"
              rel="noreferrer noopener"
              className="no-underline"
            >
              open on Monday →
            </a>
          </p>
        </>
      )}
    </div>
  );
}
