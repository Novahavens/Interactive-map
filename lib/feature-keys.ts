// Feature switches for the housing agent on the map. Pure and client-safe: the server reads the env in
// lib/features.ts and reports the result in GET /api/health; the browser reads it with featuresOn()
// (components/property/health.ts). Every feature is off unless MAP_FEATURES names it.

export const FEATURE_KEYS = ["outside", "bestMatch", "chat", "addOutside", "submit", "mine", "nearsite", "findPhone", "templates"] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const NO_FEATURES: Readonly<Record<FeatureKey, boolean>> = Object.freeze({
  outside: false,
  bestMatch: false,
  chat: false,
  addOutside: false,
  submit: false,
  mine: false,
  nearsite: false,
  findPhone: false,
  templates: false,
});

/** What else must be set up before a named feature is really on. */
export interface FeatureNeeds {
  /** MAP_EDIT_SECRET is set (every feature that reads the gated SQL functions). */
  secret: boolean;
  /** MAP_CHAT_URL and MAP_CHAT_TOKEN are both set. */
  chat: boolean;
  /** MAP_PHONE_URL is set. */
  phone: boolean;
}

// "mine" only filters claims the browser already has, so it needs nothing from the server.
const NEEDS_SECRET: ReadonlySet<FeatureKey> = new Set(["outside", "bestMatch", "chat", "addOutside", "submit", "nearsite", "findPhone", "templates"]);
const NEEDS_CHAT: ReadonlySet<FeatureKey> = new Set(["chat", "addOutside"]);
const NEEDS_PHONE: ReadonlySet<FeatureKey> = new Set(["findPhone"]);

/**
 * MAP_FEATURES is a comma list of feature keys ("outside,bestMatch"); case and spaces don't matter, unknown
 * names are ignored, and "all" names every feature. A named feature is on only when what it needs is set up.
 */
export function parseFeatures(raw: string | null | undefined, needs: FeatureNeeds): Record<FeatureKey, boolean> {
  const named = new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const all = named.has("all");
  const out: Record<FeatureKey, boolean> = { ...NO_FEATURES };
  for (const key of FEATURE_KEYS) {
    if (!all && !named.has(key.toLowerCase())) continue;
    if (NEEDS_SECRET.has(key) && !needs.secret) continue;
    if (NEEDS_CHAT.has(key) && !needs.chat) continue;
    if (NEEDS_PHONE.has(key) && !needs.phone) continue;
    out[key] = true;
  }
  return out;
}
