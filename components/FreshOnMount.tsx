"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Force one server refetch when this page is shown.
 *
 * WHY. Reported 2026-08-27: "when I answer a question, click reveal, then
 * click your answers - I don't [see] the most recent answer."
 *
 * `export const dynamic = "force-dynamic"` makes the SERVER render fresh, but
 * it says nothing about whether the browser asks the server at all. Next's
 * client Router Cache can answer a navigation from a payload it already holds
 * - always on back/forward, and potentially on a repeat visit within a
 * session - so a page whose data changed a second ago can be shown exactly as
 * it looked before the change. Nothing is broken server-side, which is why
 * this looks like lost data rather than a caching artefact.
 *
 * For most pages that trade-off is right. For this one it is not: "Your
 * answers" exists to show the answer you just gave, and a version of it that
 * is one answer behind is worse than a brief re-fetch. Always-current is the
 * correct semantic here, so it is stated explicitly rather than left to
 * whatever the cache happens to hold.
 *
 * Runs exactly once per mount. router.refresh() re-renders the server
 * component in place; it does not remount this one, so the effect cannot
 * retrigger itself. The ref is belt-and-braces against a future StrictMode
 * double-invoke turning one refetch into two.
 */
export function FreshOnMount() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    router.refresh();
  }, [router]);

  return null;
}
