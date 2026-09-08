"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import type { UsPlace } from "@/lib/geo/places";
import {
  passwordScore,
  passwordStrengthIssue,
  passwordStrengthMessage,
} from "@/lib/server/password-strength";
import { HONEYPOT_FIELD } from "@/lib/form-guard";

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [place, setPlace] = useState<UsPlace | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /*
   * Bot heuristics, both invisible to a real person:
   *  - a honeypot input the CSS hides; a human never sees it to fill it in.
   *  - when the form first rendered, so the server can reject a submission
   *    that arrived faster than anyone could have typed it.
   * Verified server-side in lib/server/guard.ts - these values are only
   * collected here.
   */
  const [honeypot, setHoneypot] = useState("");
  /*
   * Null until Turnstile hands over a token, and reset to null when one
   * expires. When Turnstile is not configured the widget renders nothing and
   * this stays null - which is why the submit button must NOT require it (see
   * the disabled= expression), or an unconfigured environment could never
   * sign anyone up.
   */
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  /*
   * Stamped in an effect, not during render. Date.now() is impure, and
   * calling it in a render body makes the value depend on how many times
   * React happens to re-render - the compiler lint catches this. An effect
   * also measures the more meaningful moment: when the form actually
   * appeared on screen, rather than when React first evaluated it.
   *
   * Null until mounted; the server skips the timing check when the value is
   * absent rather than treating a missing stamp as suspicious.
   */
  const renderedAt = useRef<number | null>(null);
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);

  /*
   * The SAME function the server validates with, imported rather than
   * reimplemented. A separate client-side copy would inevitably drift, and
   * then the form would accept a password the API rejects. The server is
   * still the authority - this is only here so the answer arrives before the
   * round trip.
   */
  const strength = useMemo(
    () => (password ? passwordStrengthIssue(password, { email, displayName }) : null),
    [password, email, displayName],
  );
  const score = useMemo(() => passwordScore(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName,
        birthYear: birthYear ? Number(birthYear) : null,
        city: place?.city ?? null,
        state: place?.state ?? null,
        acceptedTerms,
        turnstileToken,
        [HONEYPOT_FIELD]: honeypot,
        formRenderedAt: renderedAt.current,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Something went wrong.");
      setPending(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    setPending(false);

    if (result?.error) {
      // Account was created but sign-in failed for some other reason - send
      // them to sign in manually rather than leaving them stuck.
      router.push("/signin");
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Linework</p>
          <h1 className="title">Sign up</h1>
        </header>

        <form className="stack-4" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="field-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="field-input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              aria-describedby="password-help"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {/*
              A meter plus one specific sentence. The meter alone tells
              someone they are doing badly without telling them what to
              change, which is the usual reason these are useless.
            */}
            <div className="strength" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={i < score ? "strength-bar strength-bar--on" : "strength-bar"}
                />
              ))}
            </div>
            <p className="note" id="password-help">
              {password && strength
                ? passwordStrengthMessage(strength)
                : "At least 8 characters. A few unrelated words beats a short password with symbols in it."}
            </p>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              className="field-input"
              type="text"
              autoComplete="nickname"
              maxLength={40}
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="note">Not your legal name - shown only if this project ever shows names anywhere.</p>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="birthYear">Birth year (optional)</label>
            <input
              id="birthYear"
              className="field-input"
              type="number"
              inputMode="numeric"
              min={1900}
              max={new Date().getFullYear() - 5}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
            />
            <p className="note">
              Year only, not your full birthday - enough for age-bucket research, nothing
              more precise than that.
            </p>
          </div>

          <CityAutocomplete selected={place} onSelect={setPlace} />

          {/*
            The honeypot. Hidden from sight and from assistive technology,
            and explicitly removed from the tab order, so no real person can
            reach it by any route - only a script that fills every input it
            finds in the markup.
          */}
          <div className="honeypot" aria-hidden="true">
            <label htmlFor={HONEYPOT_FIELD}>Leave this field empty</label>
            <input
              id={HONEYPOT_FIELD}
              name={HONEYPOT_FIELD}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="terms-agree">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              {/*
                Both links open in a NEW TAB (target="_blank"). That is the
                whole mechanism behind "make sure their typed info is still
                there after they exit Terms": navigating away in the same tab
                would unmount this form and lose every field, since none of
                it is persisted anywhere. A new tab leaves the form mounted
                and untouched.
              */}
              <span>
                I agree to the{" "}
                <a href="/legal/terms" target="_blank" rel="noreferrer noopener">
                  terms of use
                </a>{" "}
                and the{" "}
                <a href="/legal/privacy" target="_blank" rel="noreferrer noopener">
                  privacy policy
                </a>
                .
              </span>
            </label>
          </div>

          <TurnstileWidget onToken={setTurnstileToken} />

          {error ? <p className="field-error" role="alert">{error}</p> : null}

          <button
            type="submit"
            className="button button--primary"
            disabled={pending || !acceptedTerms || strength !== null}
          >
            {pending ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="note">
          Already have an account? <a href="/signin">Sign in</a>
        </p>
      </div>
    </main>
  );
}
