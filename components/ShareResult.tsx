"use client";

import { useState } from "react";

/**
 * Share a finished chart, from beside Reveal and Redraw.
 *
 * Requested 2026-08-27: "the share button should allow the user to send the
 * link and the completed chart with some message (users will share it with
 * their friends and friends will also join the website)".
 *
 * WHAT GETS SHARED, AND WHY IT IS A LINK RATHER THAN AN IMAGE FILE.
 * The link points at /play/<slug>?score=<n>, which already has OG metadata
 * pointing at /api/og - so every messaging app, Slack, iMessage and social
 * feed renders a card with the score on it. That IS the "completed chart"
 * half of the request, and it arrives without asking the browser for file
 * -sharing permissions, without generating a PNG on the device, and without
 * the failure modes of navigator.share({files}) (unsupported on most
 * desktops, and on several platforms an attached image REPLACES the link
 * preview and drops the URL, which would defeat the point - the friend has
 * to be able to click through).
 *
 * The OG card deliberately shows the score over an abstract pattern, never
 * the real curve, so sharing a result cannot hand a friend the answer to a
 * chart they have not drawn yet.
 *
 * Web Share where it exists (essentially every phone, which is where sharing
 * actually happens), clipboard everywhere else, and a visible confirmation
 * either way - a share button that appears to do nothing is worse than none.
 */
export function ShareResult({
  slug,
  title,
  score,
}: {
  slug: string;
  title: string;
  score: number;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const share = async () => {
    const url = `${window.location.origin}/play/${slug}?score=${score}`;
    const text = `I scored ${score}/100 drawing "${title}" on Linework. Think you can do better?`;

    // navigator.share must be called directly from the click to keep the
    // user-gesture, so no awaiting anything before it.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Linework", text, url });
        return;
      } catch (error) {
        // AbortError means they opened the sheet and dismissed it. That is a
        // decision, not a failure, and must not be reported as one.
        if (error instanceof Error && error.name === "AbortError") return;
        // Anything else falls through to the clipboard path below.
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setState("copied");
      window.setTimeout(() => setState("idle"), 4000);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 6000);
    }
  };

  return (
    <>
      <button type="button" className="button" onClick={share}>
        {state === "copied" ? "Link copied" : "Share"}
      </button>
      {state === "failed" ? (
        <span className="note" role="status">
          Couldn&apos;t copy - your browser blocked it.
        </span>
      ) : null}
    </>
  );
}
