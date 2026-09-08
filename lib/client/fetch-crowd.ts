import type { CrowdResult } from "../server/db.ts";

export type { CrowdResult } from "../server/db.ts";

export type FetchCrowdOutcome =
  | { ok: true; value: CrowdResult }
  | { ok: false; error: string };

/**
 * Fetch the precomputed crowd view for one dataset.
 *
 * Called after reveal, in parallel with the reveal animation - like guess
 * submission, this never blocks the one orchestrated moment in the product.
 * If it fails or is slow, the score panel still shows; the crowd section
 * simply does not appear.
 */
export async function fetchCrowd(
  slug: string,
  signal?: AbortSignal,
): Promise<FetchCrowdOutcome> {
  try {
    const response = await fetch(`/api/crowd/${encodeURIComponent(slug)}`, {
      signal,
    });

    if (!response.ok) {
      let message = `request failed with ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // Non-JSON error body. The status is enough.
      }
      return { ok: false, error: message };
    }

    return { ok: true, value: (await response.json()) as CrowdResult };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "aborted" };
    }
    return { ok: false, error: "network unavailable" };
  }
}
