"use client";

import { useCallback, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google";

export interface PlaceSuggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/** A suggestion resolved to a place: where it is, the address Google prints, and the parts the board keeps. */
export interface PickedPlace {
  lat: number;
  lng: number;
  address: string;
  city: string | null;
  state: string | null;
  zipcode: string | null;
}

/**
 * Places Autocomplete (new API) behind one text box: the loss-address search and the Address field of the
 * edit form. One session token per search; the token is consumed by the fetchFields of the pick, so Google
 * bills per session, not per keystroke (E4). `reset` ends a session that never picked (the box was cleared).
 */
export function usePlaces(apiKey: string) {
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);

  const places = useCallback(async (): Promise<google.maps.PlacesLibrary> => {
    if (placesRef.current) return placesRef.current;
    const g = await loadGoogleMaps(apiKey);
    placesRef.current = (await g.importLibrary("places")) as google.maps.PlacesLibrary;
    return placesRef.current;
  }, [apiKey]);

  const suggest = useCallback(
    async (input: string, max = 6): Promise<PlaceSuggestion[]> => {
      const lib = await places();
      if (!tokenRef.current) tokenRef.current = new lib.AutocompleteSessionToken();
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: tokenRef.current,
        includedRegionCodes: ["us"],
      });
      return suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => !!p)
        .slice(0, max)
        .map((p) => ({ id: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "", prediction: p }));
    },
    [places],
  );

  /** Resolves a suggestion; `parts` also reads the address components (city, state, zip). Null when Google has no position for it. */
  const resolve = useCallback(async (s: PlaceSuggestion, opts: { parts?: boolean } = {}): Promise<PickedPlace | null> => {
    const place = s.prediction.toPlace();
    // fetchFields closes the session: this is the single billable event.
    await place.fetchFields({ fields: ["location", "formattedAddress", ...(opts.parts ? ["addressComponents"] : [])] });
    tokenRef.current = null;
    const loc = place.location;
    if (!loc) return null;
    const comps = opts.parts ? (place.addressComponents ?? []) : [];
    const part = (type: string, short = false): string | null => {
      const c = comps.find((x) => x.types.includes(type));
      return c ? ((short ? c.shortText : c.longText) ?? null) : null;
    };
    return {
      lat: loc.lat(),
      lng: loc.lng(),
      address: place.formattedAddress ?? s.main,
      city: part("locality") ?? part("sublocality") ?? part("postal_town") ?? part("administrative_area_level_3"),
      state: part("administrative_area_level_1", true),
      zipcode: part("postal_code"),
    };
  }, []);

  const reset = useCallback(() => {
    tokenRef.current = null;
  }, []);

  return { suggest, resolve, reset };
}
