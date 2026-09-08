"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Take a chart out of circulation, or put it back.
 *
 * Same two-step arm-then-confirm pattern as AdminVerifyToggle, for the same
 * reason ("approval should require double check") and with the same
 * auto-disarm so a stray late click cannot confirm something the admin had
 * already moved past. Retiring deserves it at least as much as verifying:
 * it removes a chart from every player's queue and from their answer history.
 *
 * The real enforcement is server-side regardless - role check in the route
 * plus the datasets_retired_not_active constraint. This is a safety habit,
 * not a security boundary.
 */
const CONFIRM_WINDOW_MS = 5000;

export function AdminRetireToggle({
  slug,
  retired,
}: {
  slug: string;
  retired: boolean;
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
      const response = await fetch(`/api/admin/datasets/${slug}/retire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retire: !retired }),
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
            : retired
              ? "Confirm restore?"
              : "Confirm deactivate?"}
        </button>
        <button type="button" className="button" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="stack-2">
      <button type="button" className="button" onClick={arm}>
        {retired ? "Restore" : "Deactivate"}
      </button>
      {error ? <p className="note">{error}</p> : null}
    </div>
  );
}
