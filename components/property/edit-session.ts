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
  /** Sent fields Monday didn't confirm when the route read them back (empty when all went through). */
  unconfirmed: EditKey[];
  /** How many fields were sent, so "every field unconfirmed" can be told apart from "some". */
  sent: number;
  /** The fields sent. */
  keys: EditKey[];
  /** Every field already held these values in Monday (a stale panel, a second tab, a retry of a save that landed). */
  alreadySaved: boolean;
  /** With alreadySaved: a change note was owed from an earlier save; with noted:false it couldn't be posted. */
  noteOwed: boolean;
}

/** What the save sent: the changed fields and the values they started from. */
export interface SentEdit {
  editor: string;
  changes: EditChanges;
  base: EditChanges;
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

const listLabels = (keys: EditKey[]) => {
  const labels = keys.map((k) => FIELD_BY_KEY.get(k)?.label ?? k);
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
};

/** The line after a save, and whether it is a warning (kept until dismissed) rather than a confirmation. */
export function savedText(o: SavedOutcome): { text: string; warn: boolean } {
  if (o.dryRun) return { text: "Dry run: nothing was written to Monday.", warn: false };
  // Nothing was written, so no note was due, unless an earlier save landed without one and posting it failed.
  if (o.alreadySaved) {
    return o.noteOwed && !o.noted
      ? { text: "Already saved in Monday. The Monday note couldn't be posted.", warn: false }
      : { text: "Already saved in Monday.", warn: false };
  }
  if (o.unconfirmed.length > 0 && o.unconfirmed.length >= o.sent) return { text: "Monday may not have saved this. Reopen the property to check.", warn: true };
  if (o.unconfirmed.length > 0) return { text: `Saved, but Monday didn't confirm ${listLabels(o.unconfirmed)}. Reopen the property to check.`, warn: true };
  return { text: o.noted ? "Saved to Monday." : "Saved to Monday. The Monday note couldn't be posted.", warn: false };
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
/** After a save Monday didn't fully confirm: keep only those fields (and where they started) to retry. */
function storeUnconfirmed(id: string, sent: SentEdit, keys: EditKey[]) {
  try {
    const raw: Partial<Raw> = {};
    const base: Partial<Values> = {};
    for (const k of keys) {
      raw[k] = toRaw(sent.changes[k]);
      base[k] = sent.base[k] ?? null;
    }
    sessionStorage.setItem(storeKey(id), JSON.stringify({ name: sent.editor, raw, base } satisfies Stored));
  } catch {
    // blocked storage: the warning still names the fields
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
  /** The line after a save: "Saved to Monday." for ~6 s, or a warning kept until dismissed. */
  note: { propertyId: string; text: string; warn: boolean } | null;
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
  saved: (propertyId: string, detail: PropertyDetail, outcome: SavedOutcome, sent: SentEdit) => void;
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
    if (!note || note.warn) return;
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
      // A field Monday now holds as typed (an unconfirmed save that landed after all) has nothing left to restore.
      const storedKeys = Object.keys(stored.raw)
        .filter((k): k is EditKey => FIELD_BY_KEY.has(k))
        .filter((k) => evaluate(FIELD_BY_KEY.get(k) as EditField, String(stored.raw[k] ?? ""), base[k]).changed);
      const stillMatches = storedKeys.length > 0 && storedKeys.every((k) => sameValue((stored.base[k] ?? null) as EditValue, base[k]));
      if (storedKeys.length === 0) clearStored(id);
      else if (stillMatches) {
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
    (propertyId: string, detail: PropertyDetail, outcome: SavedOutcome, sent: SentEdit) => {
      const action = pending.current;
      if (draftRef.current?.propertyId === propertyId) close();
      else clearStored(propertyId);
      if (outcome.unconfirmed.length > 0 && !outcome.dryRun && !outcome.alreadySaved) storeUnconfirmed(propertyId, sent, outcome.unconfirmed);
      setNote({ propertyId, ...savedText(outcome) });
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
