"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EDIT_FIELDS,
  FIELD_BY_KEY,
  currentValue,
  normaliseValue,
  sameValue,
  type EditChanges,
  type EditField,
  type EditKey,
  type EditValue,
} from "@/lib/listing-edit";
import type { PropertyDetail } from "@/lib/types";
import { readReporterName } from "./ReportBadLink";

// One listing-edit session for the whole page. It lives above the two panel copies (desktop rail and phone
// sheet), so the draft survives a switch between them, and only the copy on screen shows the form. A draft is
// also kept in sessionStorage while it has changes, so it survives the iframe being torn down.

export const FIELDS = EDIT_FIELDS as readonly EditField[];
export type Values = Record<EditKey, EditValue>;
export type Raw = Record<EditKey, string>;

export type DraftStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  /** `plain`: show the message as it is, without "Not saved." in front (Monday may have taken it). */
  | { kind: "error"; message: string; plain?: boolean }
  | { kind: "conflict"; fields: EditKey[]; current: EditChanges };

export interface EditDraft {
  propertyId: string;
  raw: Raw;
  base: Values;
  name: string;
  shown: Partial<Record<EditKey, string>>;
  nameError: string | null;
  /** "Discard N changes?" is showing. `askSeq` moves on every new ask so the form can put focus on Keep editing. */
  confirming: boolean;
  askSeq: number;
  status: DraftStatus;
  /** Shown at the top of the form when Edit opened on a stored draft. */
  notice: "restored" | "stale" | null;
  /** Focus the first field when the form mounts (only right after Edit, not when it moves between layouts). */
  autofocus: boolean;
}

/** What the server said about a save that went through. */
export interface SavedOutcome {
  noted: boolean;
  mirrored: boolean;
  dryRun: boolean;
}

export const toRaw = (v: EditValue | undefined): string => (v === null || v === undefined ? "" : String(v));

/** One field against where the form started: unchanged, changed to a valid value, or changed and invalid. */
export function evaluate(field: EditField, raw: string, base: EditValue): { changed: false } | { changed: true; value: EditValue } | { changed: true; error: string } {
  // Untouched stays unchanged even when the stored value wouldn't validate (pets "N/D").
  if (raw === toRaw(base)) return { changed: false };
  const n = normaliseValue(field, raw);
  if (!n.ok) return { changed: true, error: n.error };
  if (sameValue(n.value, base)) return { changed: false };
  return { changed: true, value: n.value };
}

export function changedKeys(d: Pick<EditDraft, "raw" | "base">): EditKey[] {
  return FIELDS.filter((f) => evaluate(f, d.raw[f.key], d.base[f.key]).changed).map((f) => f.key);
}

export function baseOf(detail: PropertyDetail): Values {
  const row = detail as unknown as Record<string, unknown>;
  return Object.fromEntries(FIELDS.map((f) => [f.key, currentValue(f, row)])) as Values;
}
export const rawOf = (base: Values): Raw => Object.fromEntries(FIELDS.map((f) => [f.key, toRaw(base[f.key])])) as Raw;

export function savedText(o: SavedOutcome): string {
  if (o.dryRun) return "Dry run: nothing was written to Monday.";
  return o.noted ? "Saved to Monday." : "Saved to Monday. The Monday note couldn't be posted.";
}

// ---- the stored draft: only the changed fields, with the values they started from ----
const storeKey = (id: string) => `nh-edit-draft:${id}`;
interface Stored {
  name: string;
  raw: Partial<Raw>;
  base: Partial<Values>;
}
function readStored(id: string): Stored | null {
  try {
    const s = sessionStorage.getItem(storeKey(id));
    if (!s) return null;
    const v = JSON.parse(s) as Stored;
    if (!v || typeof v !== "object" || typeof v.raw !== "object" || typeof v.base !== "object") return null;
    return v;
  } catch {
    return null;
  }
}
function writeStored(d: EditDraft, keys: EditKey[]) {
  try {
    const raw: Partial<Raw> = {};
    const base: Partial<Values> = {};
    for (const k of keys) {
      raw[k] = d.raw[k];
      base[k] = d.base[k];
    }
    sessionStorage.setItem(storeKey(d.propertyId), JSON.stringify({ name: d.name, raw, base } satisfies Stored));
  } catch {
    // blocked storage: the draft still lives for this page
  }
}
function clearStored(id: string) {
  try {
    sessionStorage.removeItem(storeKey(id));
  } catch {
    // nothing to clear
  }
}

const SAVED_MS = 6000;

export interface EditSession {
  draft: EditDraft | null;
  /** Unsaved changes in the open draft (0 when none is open). */
  count: number;
  editingOff: boolean;
  /** The "Saved to Monday." line for a property, for ~6 s. */
  note: { propertyId: string; text: string } | null;
  dismissNote: () => void;
  open: (detail: PropertyDetail) => void;
  update: (propertyId: string, fn: (d: EditDraft) => EditDraft) => void;
  /** Runs `action` unless the open draft has changes: then asks "Discard N changes?" first (or, while saving, runs it after a successful save). */
  guard: (action: () => void) => void;
  /** The form's own Cancel / Escape. */
  requestCancel: () => void;
  /** Discard: close the form, then run whatever asked. */
  discard: () => void;
  /** Keep editing: forget whatever asked. */
  keep: () => void;
  startOver: () => void;
  saved: (propertyId: string, detail: PropertyDetail, outcome: SavedOutcome) => void;
  /** A save that failed (the form stays): an action that waited for it is dropped. */
  failed: () => void;
  markEditingOff: () => void;
  /** Close without asking and without forgetting the stored draft (the selection moved away by other means). */
  drop: () => void;
}

export function useEditSession(onSaved: (detail: PropertyDetail, outcome: SavedOutcome) => void): EditSession {
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editingOff, setEditingOff] = useState(false);
  const [note, setNote] = useState<EditSession["note"]>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pending = useRef<(() => void) | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const keys = draft ? changedKeys(draft) : [];
  const count = keys.length;

  // The stored draft follows the typing; nothing is stored while nothing has changed.
  const storeSig = draft ? JSON.stringify([draft.propertyId, draft.name, keys.map((k) => [k, draft.raw[k], draft.base[k]])]) : "";
  useEffect(() => {
    const d = draftRef.current;
    if (!d) return;
    const k = changedKeys(d);
    if (k.length > 0) writeStored(d, k);
    else clearStored(d.propertyId);
  }, [storeSig]);

  // Leaving or reloading the page with unsaved changes asks the browser's own question.
  useEffect(() => {
    if (count === 0) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [count]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), SAVED_MS);
    return () => clearTimeout(t);
  }, [note]);

  const close = useCallback(() => {
    const d = draftRef.current;
    if (d) clearStored(d.propertyId);
    pending.current = null;
    draftRef.current = null;
    setDraft(null);
  }, []);

  const drop = useCallback(() => {
    pending.current = null;
    draftRef.current = null;
    setDraft(null);
  }, []);

  const open = useCallback((detail: PropertyDetail) => {
    const id = detail.monday_item_id;
    setNote(null);
    if (draftRef.current?.propertyId === id) return;
    pending.current = null;
    const base = baseOf(detail);
    let raw = rawOf(base);
    let name = readReporterName();
    let notice: EditDraft["notice"] = null;
    const stored = readStored(id);
    if (stored) {
      const storedKeys = Object.keys(stored.raw).filter((k): k is EditKey => FIELD_BY_KEY.has(k));
      const stillMatches = storedKeys.length > 0 && storedKeys.every((k) => sameValue((stored.base[k] ?? null) as EditValue, base[k]));
      if (stillMatches) {
        raw = { ...raw, ...Object.fromEntries(storedKeys.map((k) => [k, String(stored.raw[k] ?? "")])) };
        if (typeof stored.name === "string" && stored.name.trim()) name = stored.name;
        notice = "restored";
      } else {
        clearStored(id);
        notice = "stale";
      }
    }
    const next: EditDraft = { propertyId: id, raw, base, name, shown: {}, nameError: null, confirming: false, askSeq: 0, status: { kind: "idle" }, notice, autofocus: true };
    draftRef.current = next;
    setDraft(next);
  }, []);

  const update = useCallback((propertyId: string, fn: (d: EditDraft) => EditDraft) => {
    setDraft((d) => {
      const next = d && d.propertyId === propertyId ? fn(d) : d;
      draftRef.current = next;
      return next;
    });
  }, []);

  const ask = useCallback(() => {
    setDraft((d) => {
      const next = d && { ...d, confirming: true, askSeq: d.askSeq + 1 };
      draftRef.current = next;
      return next;
    });
  }, []);

  const guard = useCallback(
    (action: () => void) => {
      const d = draftRef.current;
      if (!d) return action();
      if (d.status.kind === "saving") {
        pending.current = action; // runs right after a successful save, dropped if it fails
        return;
      }
      if (changedKeys(d).length === 0) {
        close();
        return action();
      }
      pending.current = action;
      ask();
    },
    [ask, close],
  );

  const requestCancel = useCallback(() => {
    const d = draftRef.current;
    if (!d || d.status.kind === "saving") return;
    if (changedKeys(d).length === 0) close();
    else ask();
  }, [ask, close]);

  const discard = useCallback(() => {
    const action = pending.current;
    close();
    action?.();
  }, [close]);

  const keep = useCallback(() => {
    pending.current = null;
    setDraft((d) => {
      const next = d && { ...d, confirming: false };
      draftRef.current = next;
      return next;
    });
  }, []);

  const startOver = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    clearStored(d.propertyId);
    update(d.propertyId, (x) => ({ ...x, raw: rawOf(x.base), shown: {}, notice: null, status: { kind: "idle" } }));
  }, [update]);

  const saved = useCallback(
    (propertyId: string, detail: PropertyDetail, outcome: SavedOutcome) => {
      const action = pending.current;
      if (draftRef.current?.propertyId === propertyId) close();
      else clearStored(propertyId);
      setNote({ propertyId, text: savedText(outcome) });
      onSavedRef.current(detail, outcome);
      action?.();
    },
    [close],
  );

  const failed = useCallback(() => {
    pending.current = null;
  }, []);

  const markEditingOff = useCallback(() => setEditingOff(true), []);
  const dismissNote = useCallback(() => setNote(null), []);

  return { draft, count, editingOff, note, dismissNote, open, update, guard, requestCancel, discard, keep, startOver, saved, failed, markEditingOff, drop };
}
