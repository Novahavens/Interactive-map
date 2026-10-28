"use client";

import { useEffect, useId, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
  EDIT_GROUPS,
  EDITOR_MAX,
  FIELD_BY_KEY,
  displayValue,
  normaliseValue,
  type EditChanges,
  type EditField,
  type EditGroup,
  type EditKey,
  type EditListingRequest,
  type EditValue,
} from "@/lib/listing-edit";
import type { ApiError, EditConflictResponse, EditListingResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Section } from "./parts";
import { FIELDS, evaluate, toRaw, type EditDraft, type EditSession, type Values } from "./edit-session";

const REPORTER_KEY = "nh-reporter-name";
const GROUPS = Object.keys(EDIT_GROUPS) as EditGroup[];
const NETWORK_ERROR = "Couldn't reach the map server. Try again.";
const EDITING_OFF = "Editing from the map is switched off right now.";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Props {
  draft: EditDraft;
  session: EditSession;
}

/**
 * Edit the listing details of one property; the server writes Monday, then the Supabase mirror. The draft and
 * every decision about it live in the page's edit session (./edit-session.ts), so this form can be unmounted
 * and mounted again in the other layout, mid-save included, without losing anything.
 */
export default function EditListing({ draft, session }: Props) {
  const uid = useId();
  const { propertyId, raw, base, name, shown, nameError, confirming, askSeq, status, notice } = draft;
  const update = (fn: (d: EditDraft) => EditDraft) => session.update(propertyId, fn);

  const firstRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draft.autofocus) return;
    firstRef.current?.focus();
    session.update(propertyId, (d) => ({ ...d, autofocus: false }));
    // Once, on the mount right after Edit; a later mount in the other layout leaves focus alone.
  }, []);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming, askSeq]);
  useEffect(() => {
    if (status.kind === "conflict") {
      conflictRef.current?.scrollIntoView({ block: "nearest" });
      conflictRef.current?.focus();
    }
  }, [status.kind]);

  const evals = FIELDS.map((f) => ({ field: f, ev: evaluate(f, raw[f.key], base[f.key]) }));
  const changed = evals.filter((e) => e.ev.changed);
  const count = changed.length;
  const invalid = changed.some((e) => "error" in e.ev);
  const trimmedName = name.trim();
  const nameProblem = !trimmedName ? "Enter your name" : trimmedName.length > EDITOR_MAX ? `At most ${EDITOR_MAX} characters` : null;
  const saving = status.kind === "saving";
  const canSave = count > 0 && !invalid && !nameProblem && !saving;

  function setValue(field: EditField, value: string) {
    update((d) => {
      const next = { ...d, raw: { ...d.raw, [field.key]: value } };
      // Once a message shows, it follows the typing so it clears as soon as the value is right.
      if (d.shown[field.key]) {
        const ev = evaluate(field, value, d.base[field.key]);
        next.shown = { ...d.shown, [field.key]: "error" in ev ? ev.error : undefined };
      }
      if (d.status.kind === "error") next.status = { kind: "idle" };
      return next;
    });
  }

  function check(field: EditField) {
    update((d) => {
      const ev = evaluate(field, d.raw[field.key], d.base[field.key]);
      return { ...d, shown: { ...d.shown, [field.key]: "error" in ev ? ev.error : undefined } };
    });
  }

  function keepEditing() {
    session.keep();
    requestAnimationFrame(() => cancelRef.current?.focus());
  }

  const setStatus = (st: EditDraft["status"]) => update((d) => ({ ...d, status: st }));

  async function save(useBase: Values) {
    const changes: EditChanges = {};
    const sentBase: EditChanges = {};
    for (const f of FIELDS) {
      const ev = evaluate(f, raw[f.key], useBase[f.key]);
      if (!ev.changed) continue;
      if ("error" in ev) return;
      changes[f.key] = ev.value;
      sentBase[f.key] = useBase[f.key];
    }
    if (Object.keys(changes).length === 0) {
      setStatus({ kind: "idle" });
      return;
    }
    const body: EditListingRequest = { editor: trimmedName, changes, base: sentBase };
    setStatus({ kind: "saving" });
    // From here on only the session is touched: this form may be unmounted (layout switch) before the answer.
    const fail = (st: EditDraft["status"]) => {
      session.failed();
      setStatus(st);
    };
    let res: Response;
    try {
      res = await fetch(`/api/properties/${propertyId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      fail({ kind: "error", message: NETWORK_ERROR });
      return;
    }
    const json = (await res.json().catch(() => null)) as EditListingResponse | EditConflictResponse | ApiError | null;
    if (res.ok && json && "ok" in json && json.detail) {
      try {
        localStorage.setItem(REPORTER_KEY, trimmedName);
      } catch {
        // private window or blocked storage: the save still went through
      }
      session.saved(propertyId, json.detail, { noted: json.noted !== false, mirrored: json.mirrored !== false, dryRun: !!json.dryRun });
      return;
    }
    const code = json && "code" in json ? json.code : undefined;
    if (res.status === 409 && code === "conflict") {
      const c = json as EditConflictResponse;
      const fields = (c.fields ?? []).filter((k): k is EditKey => FIELD_BY_KEY.has(k));
      if (fields.length > 0) {
        fail({ kind: "conflict", fields, current: (c.current ?? {}) as EditChanges });
        return;
      }
    }
    if (code === "editing_off") {
      session.markEditingOff();
      fail({ kind: "error", message: EDITING_OFF });
      return;
    }
    // Everything else (busy, too_large, rate_limited, monday_error, …) is the route's own words; the edits stay.
    // A Monday error may mean Monday took the write after all, so its message stands alone.
    const err = json && "error" in json && json.error ? json.error : `Couldn't save (HTTP ${res.status}).`;
    fail({ kind: "error", message: err, plain: code === "monday_error" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<EditKey, string>> = {};
    for (const { field, ev } of evals) if ("error" in ev) errs[field.key] = ev.error;
    update((d) => ({ ...d, shown: errs, nameError: nameProblem }));
    if (canSave) void save(base);
  }

  function takeMondays(fields: EditKey[], current: EditChanges) {
    update((d) => ({
      ...d,
      base: { ...d.base, ...Object.fromEntries(fields.map((k) => [k, current[k] ?? null])) },
      raw: { ...d.raw, ...Object.fromEntries(fields.map((k) => [k, toRaw(current[k])])) },
      shown: { ...d.shown, ...Object.fromEntries(fields.map((k) => [k, undefined])) },
      status: { kind: "idle" },
    }));
  }

  function saveMine(fields: EditKey[], current: EditChanges) {
    const next = { ...base, ...Object.fromEntries(fields.map((k) => [k, current[k] ?? null])) } as Values;
    update((d) => ({ ...d, base: next }));
    void save(next);
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || saving) return;
        e.preventDefault();
        e.stopPropagation();
        if (confirming) keepEditing();
        else session.requestCancel();
      }}
      aria-label="Edit listing details"
      className="flex min-h-0 flex-1 flex-col text-sm"
    >
      <fieldset disabled={saving} className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0">
        <div className="nh-scroll min-h-0 flex-1 overflow-y-auto">
          {notice && (
            <div
              role="status"
              className="mx-4 mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-[13px]"
              style={
                notice === "restored"
                  ? { borderColor: "var(--line2)", background: "var(--surface-muted)", color: "var(--ink)" }
                  : { borderColor: "var(--amber-line)", background: "var(--amber-bg)", color: "var(--amber-ink)" }
              }
            >
              {notice === "restored" ? (
                <>
                  <span>Restored your unsaved changes.</span>
                  <button
                    type="button"
                    onClick={session.startOver}
                    className="text-[13px] font-medium underline underline-offset-2 [@media(pointer:coarse)]:min-h-[44px]"
                    style={{ color: "var(--focus)" }}
                  >
                    Start over
                  </button>
                </>
              ) : (
                <span>Your unsaved changes were for an older version of this property.</span>
              )}
            </div>
          )}

          {status.kind === "conflict" && (
            <div
              ref={conflictRef}
              tabIndex={-1}
              role="alert"
              className="m-4 mb-1 rounded-md border p-3 text-[13px] outline-none"
              style={{ borderColor: "var(--amber-line)", background: "var(--amber-bg)", color: "var(--amber-ink)" }}
            >
              <p className="font-medium">Someone changed {status.fields.length === 1 ? "this field" : "these fields"} in Monday since you opened the form.</p>
              <ul className="mt-2 flex flex-col gap-2">
                {status.fields.map((k) => {
                  const f = FIELD_BY_KEY.get(k) as EditField;
                  const ev = evaluate(f, raw[k], base[k]);
                  const mine = "value" in ev ? displayValue(f, ev.value) : raw[k] === "" ? "blank" : raw[k];
                  return (
                    <li key={k} className="rounded border bg-surface px-2.5 py-1.5 text-ink" style={{ borderColor: "var(--amber-line)" }}>
                      <div className="font-medium">{f.label}</div>
                      <div className="text-xs">
                        <span className="text-muted">Monday now:</span> {displayValue(f, status.current[k])}
                      </div>
                      <div className="text-xs">
                        <span className="text-muted">You entered:</span> {mine}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => takeMondays(status.fields, status.current)}
                  className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink [@media(pointer:coarse)]:h-[44px]"
                >
                  Use Monday&apos;s values
                </button>
                <button
                  type="button"
                  onClick={() => saveMine(status.fields, status.current)}
                  className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-xs font-medium text-bg hover:brightness-110 [@media(pointer:coarse)]:h-[44px]"
                >
                  Save mine anyway
                </button>
              </div>
            </div>
          )}

          {GROUPS.map((g) => {
            const fields = FIELDS.filter((f) => f.group === g);
            if (fields.length === 0) return null;
            return (
              <Section key={g} title={EDIT_GROUPS[g]}>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {fields.map((f) => {
                    const ev = evals.find((e) => e.field.key === f.key)!.ev;
                    return (
                      <FieldInput
                        key={f.key}
                        id={`${uid}-${f.key}`}
                        field={f}
                        value={raw[f.key]}
                        base={base[f.key]}
                        changed={ev.changed}
                        error={shown[f.key]}
                        inputRef={f.key === FIELDS[0].key ? firstRef : undefined}
                        onChange={(v) => setValue(f, v)}
                        onBlur={() => check(f)}
                      />
                    );
                  })}
                </div>
              </Section>
            );
          })}
        </div>

        {/* Footer: who is editing, and the actions */}
        <div className="flex flex-col gap-2 border-t border-line bg-surface px-4 py-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-editor`} className="text-xs text-muted">
              Your name
            </label>
            <input
              id={`${uid}-editor`}
              value={name}
              maxLength={EDITOR_MAX}
              autoComplete="name"
              required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${uid}-editor-error` : undefined}
              onChange={(e) => {
                const v = e.target.value;
                update((d) => ({ ...d, name: v, nameError: d.nameError && v.trim() ? null : d.nameError }));
              }}
              onBlur={() => update((d) => ({ ...d, nameError: nameProblem }))}
              className={cn(inputClass, nameError && "border-[var(--bad-ink)]")}
            />
            {nameError && (
              <p id={`${uid}-editor-error`} className="text-xs" style={{ color: "var(--bad-ink)" }}>
                {nameError}
              </p>
            )}
          </div>

          {status.kind === "error" && (
            <p role="alert" className="text-xs" style={{ color: "var(--bad-ink)" }}>
              {!status.plain && <span className="font-medium">Not saved. </span>}
              {status.message}
            </p>
          )}

          {confirming ? (
            <div role="group" aria-label="Discard changes" className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-[13px] font-medium">Discard {plural(count, "change", "changes")}?</span>
              <button type="button" onClick={session.discard} className={cn(buttonClass, "border border-line bg-surface text-[var(--bad-ink)]")}>
                Discard
              </button>
              <button ref={keepRef} type="button" onClick={keepEditing} className={cn(buttonClass, "bg-ink text-bg hover:brightness-110")}>
                Keep editing
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="submit" disabled={!canSave} className={cn(buttonClass, "flex-1 bg-ink text-bg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50")}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {saving ? "Saving…" : count > 0 ? `Save ${plural(count, "change", "changes")}` : "Save changes"}
              </button>
              <button ref={cancelRef} type="button" onClick={session.requestCancel} className={cn(buttonClass, "border border-line bg-surface text-ink")}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </fieldset>
    </form>
  );
}

const inputClass =
  "h-9 w-full min-w-0 rounded-md border border-line2 bg-surface px-2 text-[13px] text-ink disabled:opacity-60 [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:text-base";
const buttonClass = "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium [@media(pointer:coarse)]:h-[44px]";

interface FieldProps {
  id: string;
  field: EditField;
  value: string;
  base: EditValue;
  changed: boolean;
  error: string | undefined;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function FieldInput({ id, field, value, base, changed, error, inputRef, onChange, onBlur }: FieldProps) {
  const errorId = `${id}-error`;
  const wasId = `${id}-was`;
  const describedBy = [error && errorId, changed && wasId].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    value,
    onBlur,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;
  const wide = field.kind === "yesno" || field.kind === "url" || field.kind === "longtext" || field.kind === "date";
  const bad = error ? "border-[var(--bad-ink)]" : "";
  // A stored value the control can't show (pets "N/D" in a Yes/No control) is named under it.
  const stored = (field.kind === "yesno" || field.kind === "date") && !changed && value !== "" && !normaliseValue(field, value).ok ? value : null;

  let control: React.ReactNode;
  switch (field.kind) {
    case "money":
      control = (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[13px] text-muted" aria-hidden="true">
            $
          </span>
          <input
            {...common}
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            // The "$" is drawn in front of the box; a typed one would show twice.
            onChange={(e) => onChange(e.target.value.replace(/^\s*\$\s*/, ""))}
            className={cn(inputClass, "pl-5 font-mono", bad)}
          />
        </div>
      );
      break;
    case "int":
    case "decimal":
      control = (
        <input
          {...common}
          ref={inputRef}
          type="text"
          inputMode={field.kind === "int" ? "numeric" : "decimal"}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "font-mono", bad)}
        />
      );
      break;
    case "date":
      control = <input {...common} ref={inputRef} type="date" min="2020-01-01" max="2035-12-31" onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "w-auto min-w-[10rem]", bad)} />;
      break;
    case "url":
      control = <input {...common} ref={inputRef} type="url" inputMode="url" autoComplete="off" placeholder="https://" onChange={(e) => onChange(e.target.value)} className={cn(inputClass, bad)} />;
      break;
    case "longtext": {
      const max = field.maxLength ?? 2000;
      control = (
        <>
          <textarea
            {...common}
            rows={4}
            onChange={(e) => onChange(e.target.value)}
            className={cn("w-full min-w-0 resize-y rounded-md border border-line2 bg-surface px-2 py-1.5 text-[13px] text-ink [@media(pointer:coarse)]:text-base", bad)}
          />
          <p className="text-right text-xs" style={{ color: value.length > max ? "var(--bad-ink)" : "var(--muted)" }} aria-live="polite">
            {value.length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
          </p>
        </>
      );
      break;
    }
    case "yesno":
      control = <Segmented id={id} labelId={`${id}-label`} value={value} describedBy={describedBy} onChange={onChange} />;
      break;
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "col-span-2")}>
      {field.kind === "yesno" ? (
        <span id={`${id}-label`} className="inline-flex items-center gap-1.5 text-xs text-muted">
          {field.label}
          {changed && <span className="nh-field-changed" aria-hidden="true" />}
        </span>
      ) : (
        <label htmlFor={id} className="inline-flex items-center gap-1.5 text-xs text-muted">
          {field.label}
          {changed && <span className="nh-field-changed" aria-hidden="true" />}
        </label>
      )}
      {control}
      {stored && <p className="text-xs text-muted">Stored as “{stored}”</p>}
      {error && (
        <p id={errorId} className="text-xs" style={{ color: "var(--bad-ink)" }}>
          {error}
        </p>
      )}
      {changed && (
        <p id={wasId} className="text-xs text-muted [overflow-wrap:anywhere]">
          was {displayValue(field, base)}
        </p>
      )}
    </div>
  );
}

const CHOICES = [
  { label: "Yes", value: "Yes" },
  { label: "No", value: "No" },
  { label: "Blank", value: "" },
] as const;

/** Yes / No / Blank as one radio group: arrows move and select, Tab leaves. */
function Segmented({ id, labelId, value, describedBy, onChange }: { id: string; labelId: string; value: string; describedBy?: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = CHOICES.findIndex((c) => c.value.toLowerCase() === value.trim().toLowerCase());
  const tabIndexAt = checkedIndex === -1 ? 0 : checkedIndex;

  function move(to: number) {
    const i = (to + CHOICES.length) % CHOICES.length;
    onChange(CHOICES[i].value);
    refs.current[i]?.focus();
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="inline-flex w-fit gap-0 rounded-[7px] border border-line bg-surface-muted p-0.5"
    >
      {CHOICES.map((c, i) => {
        const on = i === checkedIndex;
        return (
          <button
            key={c.label}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabIndexAt ? 0 : -1}
            onClick={() => onChange(c.value)}
            onKeyDown={(e) => {
              const k = e.key;
              if (k === "ArrowRight" || k === "ArrowDown") move(i + 1);
              else if (k === "ArrowLeft" || k === "ArrowUp") move(i - 1);
              else if (k === "Home") move(0);
              else if (k === "End") move(CHOICES.length - 1);
              else return;
              e.preventDefault();
            }}
            className={cn(
              "h-7 min-w-[3.25rem] rounded-[5px] px-2.5 text-[13px] font-medium [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:min-w-[4rem]",
              on ? "bg-ink text-bg" : "text-muted hover:text-ink",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
