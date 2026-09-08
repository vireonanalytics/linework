import places from "./us-places.json" with { type: "json" };
import { isValidStateName } from "./us-states.ts";

/**
 * "City/state via autocomplete against a real place list, not free text."
 *
 * The list itself: the 1000 largest US cities by population, city/state pairs
 * only (source: a widely-used public compilation derived from Census data,
 * trimmed to just the two fields this app needs - no population, coordinates
 * or growth figures, which this app has no use for and no business storing).
 *
 * This is a real, bounded, verifiable list, not a live geocoding API - no new
 * external dependency, no API key, no per-request cost. The tradeoff is
 * coverage: a real user in a small town outside the top 1000 will not find
 * their exact city here. That is a known limitation, not a bug - see
 * docs/DESIGN.md.
 */
export type UsPlace = { city: string; state: string };

const PLACES: readonly UsPlace[] = places as UsPlace[];

/** Exact city+state match against the bundled list. */
export function isValidPlace(city: string, state: string): boolean {
  return PLACES.some((p) => p.city === city && p.state === state);
}

/**
 * Autocomplete: cities whose name starts with the query, case-insensitively.
 * Capped, since this is for a dropdown, not a data export.
 */
export function searchPlaces(query: string, limit = 8): UsPlace[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const results: UsPlace[] = [];
  for (const place of PLACES) {
    if (place.city.toLowerCase().startsWith(needle)) {
      results.push(place);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export { isValidStateName };
