/**
 * Send a finished guess to the server.
 *
 * Deliberately fire-and-forget from the player's point of view: the reveal
 * animation is the one orchestrated moment in the product and it must never
 * wait on a network round trip. The request goes out as the animation starts,
 * and the ~900ms of animation hides the latency. If the server answers in
 * time, its score is what gets shown; if it does not, the locally computed one
 * stands and the player never knows.
 */

export type SubmitGuessRequest = {
  slug: string;
  path: number[];
  drawMs: number;
  redrawCount: number;
  viewportWidth: number;
};

export type SubmitGuessResponse = {
  guessId: number | null;
  orderInSession: number | null;
  /** This guess's position among every guess ever recorded for this dataset - not the global row id. Null when not persisted. */
  datasetGuessNumber: number | null;
  /**
   * False for an anonymous guess on one of the two no-account intro
   * datasets - the score is still real and server-computed, but by design
   * the row is never written. See app/api/guess/route.ts.
   */
  persisted: boolean;
  score: number;
  meanAbsError: number;
  meanSignedError: number;
  /**
   * Set when the server judged this guess to be deliberate junk AND the
   * account has done it more than once. Explains why the data matters rather
   * than accusing - see lib/server/low-effort.ts.
   */
  notice?: string | null;
};

export type SubmitOutcome =
  | { ok: true; value: SubmitGuessResponse }
  | { ok: false; error: string; status?: number };

export async function submitGuess(
  request: SubmitGuessRequest,
  signal?: AbortSignal,
): Promise<SubmitOutcome> {
  try {
    const response = await fetch("/api/guess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      // The session cookie is httpOnly and same-origin; this keeps it attached.
      credentials: "same-origin",
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
      return { ok: false, error: message, status: response.status };
    }

    return { ok: true, value: (await response.json()) as SubmitGuessResponse };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "aborted" };
    }
    return { ok: false, error: "network unavailable" };
  }
}
