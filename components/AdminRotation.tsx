"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The rotation panel on the admin dashboard.
 *
 * Exists so narrowing the pool for launch is never a one-way door. The charts
 * held back are not retired, not deactivated and not deleted - they are live
 * in every other sense and come back with a single click here.
 */
export function AdminRotation({
  inRotation,
  heldBack,
}: {
  inRotation: number;
  heldBack: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/rotation", { method: "POST" });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `request failed (${r.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("network unavailable");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card stack-3" aria-label="Chart rotation">
      <p className="eyebrow">Rotation</p>
      <p className="admin-row-justification">
        <strong>{inRotation}</strong> of {inRotation + heldBack} active charts
        are being handed out by the queue.
        {heldBack > 0 ? (
          <>
            {" "}
            The other <strong>{heldBack}</strong> are held back — still live,
            still playable by direct link, still in the history of anyone who
            answered them. They are simply not offered to new players, so
            answers concentrate and charts reach the 50 needed to switch on the
            crowd view.
          </>
        ) : null}
      </p>
      <p className="admin-analysis">
        {inRotation * 50} answers needed for every chart in the current rotation
        to pass the crowd threshold
        {heldBack > 0
          ? ` — versus ${(inRotation + heldBack) * 50} if all of them were in.`
          : "."}
      </p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {heldBack > 0 ? (
        <div className="controls">
          <button
            type="button"
            className="button button--primary"
            onClick={restore}
            disabled={pending}
          >
            {pending ? "Restoring..." : `Put all ${heldBack} back in rotation`}
          </button>
        </div>
      ) : (
        <p className="note">
          Everything active is in rotation. To narrow it again, edit the pool in
          scripts/launch-pool.ts and run <code>npm run rotation -- --apply</code>.
        </p>
      )}
    </section>
  );
}
