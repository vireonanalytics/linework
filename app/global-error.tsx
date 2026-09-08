"use client";

/**
 * Catches errors in the root layout itself - the one case app/error.tsx
 * cannot catch, because an error boundary cannot recover from a failure in
 * its own parent. This replaces the ENTIRE document (own <html>/<body>), so
 * it cannot assume app/globals.css loaded and uses inline styles only. Kept
 * deliberately plain rather than trying to match the design system - if
 * this is rendering, something more fundamental than styling has broken.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "32rem" }}>
        <h1>Something went wrong.</h1>
        <p>
          Nothing you drew was lost - drawing never depends on the network.
          Reloading usually fixes this.
        </p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
