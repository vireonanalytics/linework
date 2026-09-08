"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One click arms it, a second click within the confirm state actually sends
 * the request - "approval should require double check." A native
 * window.confirm() would do this in one line, but cannot be restyled and
 * reads as a jarring browser-chrome interruption against this design
 * system; an in-page two-step button does the same job without breaking out
 * of it. Auto-disarms after a few seconds so a stray second click long
 * after the first cannot accidentally confirm something the admin had
 * already moved on from.
 *
 * The actual enforcement lives server-side regardless (role check + a
 * database CHECK constraint - see app/api/admin/datasets/[slug]/verify/route.ts)
 * - this button is a safety habit for the human, not a security boundary.
 */
const CONFIRM_WINDOW_MS = 5000;

export function AdminVerifyToggle({
  slug,
  verified,
}: {
  slug: string;
  verified: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arm = () => {
    setArmed(true);
    window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
  };

  const commit = async () => {
    setArmed(false);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/datasets/${slug}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verify: !verified }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `request failed (${response.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("network unavailable");
    } finally {
      setPending(false);
    }
  };

  if (armed) {
    return (
      <div className="controls">
        <button
          type="button"
          className="button button--primary"
          onClick={commit}
          disabled={pending}
        >
          {pending
            ? "Working..."
            : verified
              ? "Confirm unverify?"
              : "Confirm verify & activate?"}
        </button>
        <button type="button" className="button" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="stack-2">
      <button type="button" className={verified ? "button" : "button button--primary"} onClick={arm}>
        {verified ? "Unverify" : "Verify & activate"}
      </button>
      {error ? <p className="note">{error}</p> : null}
    </div>
  );
}
