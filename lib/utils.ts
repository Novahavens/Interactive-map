import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** A readable message from anything thrown, Supabase's plain `{ message }` error objects included. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return String(e);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Math.round(Number(n)).toLocaleString("en-US")}`;
}

export function num(n: number | null | undefined, suffix = ""): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${suffix}`;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2026-11-02" -> "Nov 2". */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function miles(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return v < 10 ? `${v.toFixed(1)} mi` : `${Math.round(v)} mi`;
}

/** "Yes"/"No"/"N/D"/null → a readable word. */
export function yesNo(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.trim().toLowerCase();
  if (t === "yes" || t === "y" || t === "true") return "Yes";
  if (t === "no" || t === "n" || t === "false") return "No";
  if (t === "n/d" || t === "nd") return "Not stated";
  return s;
}

/** Pet policy as a tri-state: true allowed, false not allowed, null when not stated. */
export function petsAllowed(status: string | null | undefined): boolean | null {
  const t = (status ?? "").trim().toLowerCase();
  if (t === "yes" || t === "y" || t === "true") return true;
  if (t === "no" || t === "n" || t === "false") return false;
  return null;
}

export const MONDAY_BOARDS = { claim: "9030696652", property: "18415735059" } as const;

export function mondayItemUrl(board: string, id?: string | null): string {
  return `https://novahavens.monday.com/boards/${board}${id ? `/pulses/${id}` : ""}`;
}
