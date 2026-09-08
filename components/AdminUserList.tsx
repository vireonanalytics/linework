"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserRow } from "@/lib/server/db";

/**
 * The moderation list: every account, searchable, with block and flag
 * actions.
 *
 * Blocking asks for a reason before it will send anything. That is
 * deliberate friction - a moderation action with no recorded reason cannot
 * be reviewed or reversed with any confidence later, which is the same
 * argument guesses.suspect_reasons has carried since Phase 3. The database
 * enforces it too, so a buggy client cannot skip it.
 */
type FilterKey = "all" | "flagged" | "blocked" | "admins";

const FILTERS: Record<FilterKey, string> = {
  all: "Everyone",
  flagged: "Flagged for review",
  blocked: "Blocked",
  admins: "Admins",
};

export function AdminUserList({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (filter === "flagged" && !user.flaggedAt) return false;
      if (filter === "blocked" && !user.blockedAt) return false;
      if (filter === "admins" && user.role !== "admin") return false;
      if (!needle) return true;
      return (
        user.displayName.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        (user.city ?? "").toLowerCase().includes(needle) ||
        (user.state ?? "").toLowerCase().includes(needle)
      );
    });
  }, [users, query, filter]);

  const moderate = async (
    userId: string,
    action: "block" | "unblock" | "flag" | "unflag",
  ) => {
    let reason: string | null = null;

    if (action === "block" || action === "flag") {
      /*
       * window.prompt rather than an in-page form. This is an admin-only
       * tool used occasionally by one person, and a bespoke modal here would
       * be real work spent on a surface no player ever sees. The two-step
       * styled confirm on AdminVerifyToggle exists because THAT action
       * publishes data to the public game; this one is reversible in a click.
       */
      reason = window.prompt(
        action === "block"
          ? "Why is this account being blocked? (recorded, required)"
          : "Why is this account being flagged for review? (recorded, required)",
      );
      if (reason === null) return; // cancelled
      if (reason.trim().length === 0) {
        setError("A reason is required.");
        return;
      }
    }

    setBusy(userId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/moderate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? `request failed (${response.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("network unavailable");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack-5">
      <div className="controls">
        <div className="field admin-search-field">
          <label className="field-label" htmlFor="user-search">Search accounts</label>
          <input
            id="user-search"
            className="field-input admin-search"
            type="search"
            placeholder="Name, email, or location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="user-filter">Show</label>
          <select
            id="user-filter"
            className="field-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
          >
            {Object.entries(FILTERS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <p className="note" aria-live="polite">
        {visible.length} of {users.length} accounts
      </p>

      <div className="stack-3">
        {visible.map((user) => (
          <article className="admin-row" key={user.id}>
            <div className="admin-row-body">
              <p className="admin-row-title">
                {user.displayName}
                {user.blockedAt ? <span className="pill pill--blocked">Blocked</span> : null}
                {!user.blockedAt && user.flaggedAt ? (
                  <span className="pill pill--flagged">Flagged</span>
                ) : null}
                {user.role === "admin" ? <span className="pill">Admin</span> : null}
              </p>
              <p className="admin-row-meta">
                {user.email}
                {user.city ? ` · ${user.city}, ${user.state}` : ""}
                {user.country ? ` · ${user.country}` : ""}
              </p>
              <p className="admin-analysis">
                {user.guessCount} guesses · {user.suspectCount} flagged ·{" "}
                {user.lowEffortStrikes} low-effort strikes · joined{" "}
                {new Date(user.createdAt).toLocaleDateString()}
              </p>
              {user.blockedReason ? (
                <p className="admin-row-justification">Blocked: {user.blockedReason}</p>
              ) : null}
              {!user.blockedAt && user.flaggedReason ? (
                <p className="admin-row-justification">Flagged: {user.flaggedReason}</p>
              ) : null}
            </div>

            <div className="controls">
              {/*
                The evidence, before any decision. An admin should be able to
                look at what someone actually drew before blocking them - a
                strike count on its own is an accusation with nothing behind
                it, and the detector can be wrong.
              */}
              <a className="button" href={`/admin/users/${user.id}`}>
                View responses
              </a>

              {user.flaggedAt ? (
                <button
                  type="button"
                  className="button"
                  disabled={busy === user.id}
                  onClick={() => moderate(user.id, "unflag")}
                >
                  Clear flag
                </button>
              ) : (
                <button
                  type="button"
                  className="button"
                  disabled={busy === user.id}
                  onClick={() => moderate(user.id, "flag")}
                >
                  Flag
                </button>
              )}

              {user.blockedAt ? (
                <button
                  type="button"
                  className="button"
                  disabled={busy === user.id}
                  onClick={() => moderate(user.id, "unblock")}
                >
                  Unblock
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--primary"
                  disabled={busy === user.id}
                  onClick={() => moderate(user.id, "block")}
                >
                  Block
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
