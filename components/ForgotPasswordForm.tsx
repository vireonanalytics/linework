"use client";

import { useState } from "react";

/**
 * Ask for a reset link.
 *
 * The success message is deliberately vague about whether the address exists,
 * matching the endpoint. If this form said "no account with that address" it
 * would hand back exactly the account-enumeration answer the API refuses to
 * give - the UI is the easiest place for that guarantee to leak.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      setSent(body.message ?? "Check your inbox.");
    } catch {
      setError("Network unavailable. Try again.");
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className="card stack-3">
        <p className="question">{sent}</p>
        <p className="note">
          The link works for one hour. If nothing arrives, check your spam
          folder. If it still doesn&apos;t turn up, the address may have been
          mistyped when the account was created - contact us and we can help.
        </p>
      </div>
    );
  }

  return (
    <form className="card stack-4" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="forgot-email">
          Email
        </label>
        <input
          id="forgot-email"
          className="field-input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="controls">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? "Sending..." : "Send reset link"}
        </button>
      </div>
    </form>
  );
}
