// "Owner said": the listing facts an owner states on a call, read from Quo's own AI call summary. Decided
// 28 Oct: Quo's summaries only, nothing leaves Quo, so this is plain rules over the summary sentences, no
// model. It reads only what a sentence says outright, and a fact said two different ways is dropped rather
// than guessed. Every fact keeps the sentence it came from: the map shows it next to the value, and nothing
// reaches Monday until someone checks the prefilled Edit form and presses Save.
//
// Pure: no I/O and type-only imports, so `npm run test:unit` covers every rule here.

import type { EditKey } from "./listing-edit";

export interface Fact {
  key: EditKey;
  value: string | number;
  /** The summary sentence the value came from. */
  evidence: string;
}

/** The fields a call can fill, in the order the card and the form show them. */
export const FACT_KEYS = [
  "next_availability", "monthly_rate", "security_deposit", "pet_status", "pet_deposit", "pet_fee", "pet_rent", "furnished",
] as const satisfies readonly EditKey[];

type FactKey = (typeof FACT_KEYS)[number];
type MoneyKey = "monthly_rate" | "security_deposit" | "pet_deposit" | "pet_fee" | "pet_rent";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const ORD = String.raw`(?:st|nd|rd|th)?`;

/** Summary lines can hold several sentences; each is read on its own. */
export function sentences(lines: string[]): string[] {
  return lines
    .flatMap((l) => l.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z"'(])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

// ---------- dates ----------

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const realDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

/** A month and day without a year means the next one from the call (a date a few weeks back is still this year). */
function withYear(m: number, d: number, callDay: string, year?: number): string | null {
  const [cy] = callDay.split("-").map(Number);
  if (year !== undefined) {
    const y = year < 100 ? 2000 + year : year;
    return realDate(y, m, d) ? ymd(y, m, d) : null;
  }
  let y = cy;
  if (!realDate(y, m, d)) return null;
  const back45 = new Date(Date.parse(`${callDay}T00:00:00Z`) - 45 * 86_400_000).toISOString().slice(0, 10);
  if (ymd(y, m, d) < back45) y += 1;
  return realDate(y, m, d) ? ymd(y, m, d) : null;
}

const AVAILABLE = /\b(available|availability|vacant|vacancy|free to move|move[- ]in|ready (?:for|on|by))\b/i;
const NOW = /\b(available|vacant|ready)\b[^.;]{0,25}\b(now|immediately|right away|today)\b/i;

/** Every date a sentence gives, as YYYY-MM-DD. */
function datesIn(s: string, callDay: string): string[] {
  const out: string[] = [];
  const add = (v: string | null) => v && out.push(v);
  for (const m of s.matchAll(new RegExp(String.raw`\b${MONTH}\s+(\d{1,2})${ORD}\b(?:,?\s+(\d{4}))?`, "gi"))) {
    add(withYear(monthIndex(m[1]), Number(m[2]), callDay, m[3] ? Number(m[3]) : undefined));
  }
  for (const m of s.matchAll(new RegExp(String.raw`\b(\d{1,2})${ORD}\s+of\s+${MONTH}(?:,?\s+(\d{4}))?`, "gi"))) {
    add(withYear(monthIndex(m[2]), Number(m[1]), callDay, m[3] ? Number(m[3]) : undefined));
  }
  for (const m of s.matchAll(/(?<![\d/$])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/g)) {
    add(withYear(Number(m[1]), Number(m[2]), callDay, m[3] ? Number(m[3]) : undefined));
  }
  // Month only: "in December" or "early December" → the 1st, "mid-December" → the 15th, "end of" / "late" → the last day.
  for (const m of s.matchAll(new RegExp(String.raw`\b(in|early|beginning of|start of|mid-?|middle of|end of|late)\s*${MONTH}(?!\s+\d)\b`, "gi"))) {
    const month = monthIndex(m[2]);
    const when = m[1].toLowerCase();
    const first = withYear(month, 1, callDay);
    if (!first) continue;
    const y = Number(first.slice(0, 4));
    add(when.startsWith("mid") || when === "middle of" ? ymd(y, month, 15) : when === "end of" || when === "late" ? ymd(y, month, lastDay(y, month)) : first);
  }
  return out;
}

function availability(s: string, callDay: string): string | null {
  if (NOW.test(s)) return callDay;
  if (!AVAILABLE.test(s)) return null;
  const found = [...new Set(datesIn(s, callDay))];
  return found.length === 1 ? found[0] : null;
}

// ---------- money ----------

const AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(k\b)?|\b(\d{1,3}(?:,\d{3})+|\d{3,6})\s?(?:dollars|usd)\b/gi;

// Each amount takes the nearest word naming a cost (no other amount in between), so "$2,400 a month with a
// $500 deposit" gives rent 2,400 and deposit 500. Only with no such word does a period ("a month", "/mo") make
// it the rent. An amount nearest a cost the form doesn't take from calls ("$150 a month for utilities") is
// left alone.
const COST_WORDS: [MoneyKey | "other", RegExp][] = [
  ["pet_deposit", /\bpet deposit\b/gi],
  ["pet_fee", /\bpet fee\b/gi],
  ["pet_rent", /\bpet rent\b|\bmonthly pet\b/gi],
  ["security_deposit", /\b(?:security )?deposit\b/gi],
  ["monthly_rate", /\b(?:rent|rental rate|asking)\b/gi],
  ["other", /\b(?:utilit(?:y|ies)|electric(?:ity)?|water|internet|cleaning|application|admin|parking|hoa|fees?)\b/gi],
];
const PERIOD = /\b(?:per month|a month|monthly|month)\b|\/\s?mo(?:nth)?\b/gi;
const NEAR = 40;

type Span = { start: number; end: number };
const spans = (s: string, re: RegExp): Span[] => [...s.matchAll(re)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
const gap = (a: Span, b: Span) => (a.end <= b.start ? b.start - a.end : b.end <= a.start ? a.start - b.end : 0);
const between = (a: Span, b: Span, x: Span) => x.start >= Math.min(a.end, b.end) && x.end <= Math.max(a.start, b.start);

function moneyIn(s: string): [MoneyKey, number][] {
  const words: (Span & { key: MoneyKey | "other" })[] = [];
  for (const [key, re] of COST_WORDS) {
    for (const w of spans(s, re)) {
      // "pet deposit" is not also a security deposit, nor "monthly pet rent" a rent, nor "pet fee" another fee.
      if (!words.some((x) => x.start <= w.start && w.end <= x.end)) words.push({ ...w, key });
    }
  }
  const periods = spans(s, PERIOD);
  const amounts = [...s.matchAll(AMOUNT)].map((m) => {
    const digits = (m[1] ?? m[4]).replace(/,/g, "");
    const value = Number(m[2] ? `${digits}.${m[2]}` : digits) * (m[3] ? 1000 : 1);
    return { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, value };
  });
  const out: [MoneyKey, number][] = [];
  for (const a of amounts) {
    if (!Number.isFinite(a.value) || a.value <= 0 || a.value > 100_000) continue;
    const clear = (w: Span) => gap(a, w) <= NEAR && !amounts.some((o) => o !== a && between(a, w, o));
    const named = words.filter(clear).sort((x, y) => gap(a, x) - gap(a, y))[0];
    const key = named ? named.key : periods.some(clear) ? "monthly_rate" : null;
    if (key && key !== "other") out.push([key, Math.round(a.value * 100) / 100]);
  }
  return out;
}

// ---------- yes / no ----------

const PETS_NO = [
  /\bno (?:pets?|dogs?|cats?)\b/i,
  /\b(?:pets?|dogs?|cats?) (?:are |is )?not (?:allowed|permitted|accepted|ok(?:ay)?)\b/i,
  /\bnot pet[- ]friendly\b/i,
  /\b(?:does not|doesn't|do not|don't|won't|will not|cannot|can't) (?:allow|accept|take|permit) (?:any )?(?:pets?|dogs?|cats?|animals)\b/i,
];
const PETS_YES = [
  /\b(?:pets?|dogs?|cats?) (?:are |is )?(?:allowed|ok(?:ay)?|welcome|fine|accepted|permitted)\b/i,
  /\bpet[- ]friendly\b/i,
  /\b(?:allows?|accepts?|permits?|takes?) (?:pets?|dogs?|cats?)\b/i,
  /\bopen to (?:pets?|dogs?|cats?)\b/i,
];
const FURNISHED_NO = [/\bunfurnished\b/i, /\bnot (?:be )?(?:fully )?furnished\b/i];
const FURNISHED_YES = [/\bfurnished\b/i];

/** "Yes", "No", or null when the sentence says neither or both ("small dogs are fine but no cats"). */
function yesNo(s: string, no: RegExp[], yes: RegExp[]): "Yes" | "No" | null {
  if (!no.some((r) => r.test(s))) return yes.some((r) => r.test(s)) ? "Yes" : null;
  // A "yes" phrase inside the "no" one ("not pet-friendly") isn't a second answer.
  const rest = no.reduce((acc, r) => acc.replace(new RegExp(r.source, "gi"), " "), s);
  return yes.some((r) => r.test(rest)) ? null : "No";
}

/**
 * The facts in a call summary. `callDay` is the call's date (YYYY-MM-DD, team time) so "Nov 1" and "available
 * now" resolve to real dates. A field given two different values in the summary is left out.
 */
export function readFacts(summary: string[], callDay: string): Fact[] {
  const found = new Map<FactKey, { values: Set<string>; first: Fact }>();
  const note = (key: FactKey, value: string | number, evidence: string) => {
    const hit = found.get(key);
    if (hit) hit.values.add(String(value));
    else found.set(key, { values: new Set([String(value)]), first: { key, value, evidence } });
  };
  for (const s of sentences(summary)) {
    const date = availability(s, callDay);
    if (date) note("next_availability", date, s);
    for (const [key, value] of moneyIn(s)) note(key, value, s);
    const pets = yesNo(s, PETS_NO, PETS_YES);
    if (pets) note("pet_status", pets, s);
    const furnished = yesNo(s, FURNISHED_NO, FURNISHED_YES);
    if (furnished) note("furnished", furnished, s);
  }
  return FACT_KEYS.flatMap((k) => {
    const hit = found.get(k);
    return hit && hit.values.size === 1 ? [hit.first] : [];
  });
}
