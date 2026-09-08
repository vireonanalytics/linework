"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Set a new password from an emailed link.
 *
 * The token arrives as a prop from the server component that read it out of
 * the query string, and is submitted in the request BODY. The link itself
 * still carries it in the URL - unavoidable for something clicked from an
 * email - but the moment it is spent happens on a POST, so mail scanners
 * that fetch the link cannot consume it.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network unavailable. Try again.");
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="card stack-3">
        <p className="question">
          Your password has been changed. You can sign in with it now.
        </p>
        <p className="controls">
          <button
            type="button"
            className="button button--primary"
            onClick={() => router.push("/signin")}
          >
            Sign in
          </button>
        </p>
      </div>
    );
  }

  return (
    <form className="card stack-4" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="reset-password">
          New password
        </label>
        <input
          id="reset-password"
          className="field-input"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="note">
          At least 8 characters. Longer is stronger than complicated - a short
          phrase you will remember beats a scramble you will not.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="reset-confirm">
          Repeat new password
        </label>
        <input
          id="reset-confirm"
          className="field-input"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error ? (
        <div className="stack-2">
          <p className="field-error" role="alert">
            {error}
          </p>
          <p className="note">
            <Link href="/forgot">Request a new link</Link> if this one has
            expired.
          </p>
        </div>
      ) : null}

      <div className="controls">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? "Saving..." : "Set new password"}
        </button>
      </div>
    </form>
  );
}
