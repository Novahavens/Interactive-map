import type { HealthResponse } from "@/lib/types";

// GET /api/health, asked once per page and shared by every caller (the panel is mounted twice: desktop rail
// and phone sheet). A failed request reads as "everything off" and is not retried until the next page load.
let health: Promise<HealthResponse | null> | null = null;

export function readHealth(): Promise<HealthResponse | null> {
  health ??= fetch("/api/health", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
    .catch(() => null);
  return health;
}

/** Listing edits from the map are switched on. */
export function editingEnabled(): Promise<boolean> {
  return readHealth().then((h) => h?.editing === true);
}
