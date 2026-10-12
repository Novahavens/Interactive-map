"use client";

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let configured = false;

/**
 * Configure the Maps JS loader exactly once per page. Libraries are imported
 * lazily where needed (maps, marker, places) so nothing loads that isn't used.
 */
export async function loadGoogleMaps(apiKey: string) {
  if (!apiKey) throw new Error("Google Maps API key is not configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)");
  if (!configured) {
    setOptions({ key: apiKey, v: "weekly" });
    configured = true;
  }
  return { importLibrary };
}
