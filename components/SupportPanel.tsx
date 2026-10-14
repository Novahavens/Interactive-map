"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ApiError, SupportContext, SupportResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  /** Read when the panel opens and again on send, so the report reflects the screen as it is. */
  getContext: () => SupportContext;
}

type Step = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; dryRun: boolean } | { kind: "error"; message: string };

const MAX_MESSAGE = 2000;
const NAME_KEY = "nh-support-name";
// Vercel rejects bodies over 4.5 MB; aim well under it after encoding.
const TARGET_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE = 2400;

/** Big retina screenshots get scaled down and re-encoded; small ones go as they are. */
async function prepareImage(file: File): Promise<Blob> {
  const passThrough = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) && file.size <= 1.5 * 1024 * 1024;
  if (passThrough) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.88, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= TARGET_BYTES) return blob;
  }
  throw new Error("That image is too large to send. Try a smaller screenshot.");
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: just don't remember it */
  }
}

/** A help button over the map. It opens a small form: screenshot, description,
 *  optional name. Send posts it to the troubleshooting channel in Slack. */
export default function SupportPanel({ getContext }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [context, setContext] = useState<SupportContext | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(readName()), []);

  useEffect(() => {
    if (open) setContext(getContext());
  }, [open, getContext]);

  // The preview URL lives as long as the image does.
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const takeImage = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setImageError(null);
    if (!file.type.startsWith("image/")) {
      setImageError("That isn't an image. Use a PNG or JPEG screenshot.");
      return;
    }
    try {
      const blob = await prepareImage(file);
      setImage({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Couldn't read that image.");
    }
  }, []);

  function reset() {
    setMessage("");
    setImage(null);
    setImageError(null);
    setStep({ kind: "idle" });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && step.kind === "sent") reset();
  }

  async function send() {
    if (!message.trim() || step.kind === "sending") return;
    setStep({ kind: "sending" });
    saveName(name.trim());
    const ctx = getContext();
    setContext(ctx);
    const body = new FormData();
    body.set("message", message.trim());
    if (name.trim()) body.set("name", name.trim());
    body.set("context", JSON.stringify(ctx));
    if (image) body.set("screenshot", image.blob, "screenshot");
    try {
      const res = await fetch("/api/support", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as SupportResponse | ApiError;
      if (!res.ok) throw new Error((json as ApiError).error || `HTTP ${res.status}`);
      setStep({ kind: "sent", dryRun: (json as SupportResponse).dryRun });
    } catch (e) {
      setStep({ kind: "error", message: e instanceof Error ? e.message : "Couldn't send the report." });
    }
  }

  const sending = step.kind === "sending";
  const ctxLines = context ? describe(context) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a problem"
        title="Report a problem"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:bg-surface-muted"
      >
        <MessageCircleQuestion className="h-[18px] w-[18px]" />
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto border-line bg-surface p-0 text-ink sm:max-w-[480px]"
          onPaste={(e) => {
            const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (file) {
              e.preventDefault();
              void takeImage(file);
            }
          }}
        >
          <DialogHeader className="gap-1 border-b border-line px-4 py-3 text-left">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">Report a problem</DialogTitle>
            <DialogDescription className="text-xs text-muted">
              Goes to <span className="font-medium text-ink">#interactive-map-troubleshooting</span> on Slack.
            </DialogDescription>
          </DialogHeader>

          {step.kind === "sent" ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "var(--ok-bg)", color: "var(--ok-ink)", border: "1px solid var(--ok-line)" }}
              >
                <Check className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">{step.dryRun ? "Logged (Slack isn't connected here)" : "Sent to Slack"}</p>
              <p className="max-w-[320px] text-xs text-muted">
                {step.dryRun
                  ? "This deployment has no Slack token, so the report was written to the server log only."
                  : "The team will pick it up in the troubleshooting channel."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium">
                  Report another
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-[13px] font-medium text-bg"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {/* Screenshot */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Screenshot <span className="font-normal text-muted">(optional)</span></span>
                {image ? (
                  <div className="relative overflow-hidden rounded-lg border border-line bg-surface-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise */}
                    <img src={image.url} alt="Screenshot to send" className="max-h-48 w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      aria-label="Remove screenshot"
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      void takeImage(e.dataTransfer.files[0]);
                    }}
                    className={cn(
                      "flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[13px] text-muted",
                      dragging ? "border-ink bg-surface-muted" : "border-line2 hover:bg-surface-muted",
                    )}
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span>Paste (Ctrl/⌘ V), drop, or choose an image</span>
                  </button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    void takeImage(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {imageError && <p className="text-xs" style={{ color: "var(--bad-ink)" }}>{imageError}</p>}
              </div>

              {/* Description */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">What went wrong?</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                  required
                  rows={4}
                  placeholder="What were you doing, and what happened instead?"
                  className="resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-ink"
                />
                <span className="self-end text-[11px] text-muted">{message.length}/{MAX_MESSAGE}</span>
              </label>

              {/* Name */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Your name <span className="font-normal text-muted">(optional)</span></span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 80))}
                  autoComplete="name"
                  placeholder="So the team knows who to ask"
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-ink"
                />
              </label>

              {/* What else goes with it */}
              <details className="rounded-lg border border-line px-3 py-2 text-xs text-muted">
                <summary className="cursor-pointer select-none font-medium text-ink">Included automatically</summary>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {ctxLines.map((l) => (
                    <li key={l} className="truncate">{l}</li>
                  ))}
                </ul>
              </details>

              {step.kind === "error" && (
                <p role="alert" className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--bad-line)", background: "var(--bad-bg)", color: "var(--bad-ink)" }}>
                  {step.message}
                </p>
              )}

              <button
                type="submit"
                disabled={!message.trim() || sending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-sm font-medium text-bg disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sending ? "Sending…" : "Send to Slack"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function describe(c: SupportContext): string[] {
  const out: string[] = [];
  out.push(c.claim ? `Claim: ${c.claim.name ?? c.claim.id} (${c.claim.id})` : "Claim: none selected");
  if (c.property) out.push(`Property: ${c.property.name ?? c.property.id}`);
  if (c.search) {
    const filters = c.search.filters.length ? ` · ${c.search.filters.join(", ")}` : "";
    out.push(`Search: ${c.search.address ?? `${c.search.lat.toFixed(4)}, ${c.search.lng.toFixed(4)}`} · ${c.search.radiusMiles} mi${filters}`);
  }
  if (c.page.url) out.push(`Page: ${c.page.url}`);
  out.push(`Device: ${[c.page.viewport, c.page.theme && `${c.page.theme} mode`].filter(Boolean).join(" · ")}`);
  if (c.page.userAgent) out.push(`Browser: ${c.page.userAgent}`);
  return out;
}
