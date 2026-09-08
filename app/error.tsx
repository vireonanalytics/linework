"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Next.js App Router error boundary: catches any unhandled exception thrown
 * while rendering a page (not API routes - those already return structured
 * JSON errors, see app/api/*\/route.ts) and shows this instead of a blank
 * page or a raw stack trace.
 *
 * Does NOT catch: errors in Server Components during the initial request
 * (that is global-error.tsx), or anything inside the drawing surface itself
 * - the pointer-event path has no server dependency once a chart has
 * rendered, so a network failure there degrades gracefully already (see
 * lib/client/submit-guess.ts and lib/client/fetch-crowd.ts) rather than
 * throwing.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <main className="page">
      <div className="frame stack-4">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="title">That didn&apos;t load right.</h1>
        <p className="question">
          Nothing you drew was lost - the drawing itself never depends on the
          network. Try again, or come back in a moment.
        </p>
        <div className="controls">
          <button type="button" className="button button--primary" onClick={reset}>
            Try again
          </button>
          <Link className="button" href="/">Back to start</Link>
        </div>
      </div>
    </main>
  );
}
