"use client";

import { useState } from "react";

/**
 * Change your own password, from the account page.
 *
 * This was previously half of an AccountSecurity component that also showed
 * email-confirmation status and a resend button. That half was removed on
 * 2026-08-27 along with the confirmation flow itself: once a forgotten
 * password could be recovered without confirming, confirmation gated nothing,
 * and a status line about a step with no consequence is just noise on a page.
 *
 * The current password is required by the API even though the session already
 * proves identity - see app/api/account/password/route.ts for why a live
 * session is weaker evidence than knowing the password.
 */
export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Couldn't change your password.");
        return;
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Network unavailable.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card stack-4" aria-label="Change password">
      <p className="eyebrow">Password</p>
      {done ? (
        <p className="question" role="status">
          Your password has been changed, and we&apos;ve emailed you to say so.
          Any password-reset links you had are now dead.
        </p>
      ) : (
        <form className="stack-4" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="pw-current">
              Current password
            </label>
            <input
              id="pw-current"
              className="field-input"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="pw-new">
              New password
            </label>
            <input
              id="pw-new"
              className="field-input"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="note">At least 8 characters.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="pw-confirm">
              Repeat new password
            </label>
            <input
              id="pw-confirm"
              className="field-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="controls">
            <button type="submit" className="button button--primary" disabled={pending}>
              {pending ? "Saving..." : "Change password"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
