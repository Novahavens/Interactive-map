import "server-only";
import { editSecret } from "./edit-config";
import { parseFeatures, type FeatureKey } from "./feature-keys";

const env = (name: string): string | null => process.env[name]?.trim() || null;

/** The Search Chat webhook (n8n) and its panel key; both must be set for `chat` and `addOutside`. */
export const chatUrl = () => env("MAP_CHAT_URL");
export const chatToken = () => env("MAP_CHAT_TOKEN");
/** The owner-phone lookup webhook; must be set for `findPhone`. */
export const phoneUrl = () => env("MAP_PHONE_URL");
/** Optional shared secret sent to the phone lookup webhook in `x-map-secret`. */
export const phoneToken = () => env("MAP_PHONE_TOKEN");

/**
 * Which housing-agent features are on. MAP_FEATURES names them (comma list, see lib/feature-keys.ts); a named
 * feature still stays off until what it needs is set: MAP_EDIT_SECRET for everything that reads the gated SQL
 * functions, MAP_CHAT_URL + MAP_CHAT_TOKEN for chat and addOutside, MAP_PHONE_URL for findPhone.
 * Read on every call, so a changed env takes effect with the next deploy and nothing is cached wrongly.
 */
export function features(): Record<FeatureKey, boolean> {
  return parseFeatures(process.env.MAP_FEATURES, {
    secret: editSecret() !== null,
    chat: chatUrl() !== null && chatToken() !== null,
    phone: phoneUrl() !== null,
  });
}

export function featureOn(key: FeatureKey): boolean {
  return features()[key];
}
