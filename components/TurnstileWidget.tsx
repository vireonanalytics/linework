"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The Turnstile challenge on the signup form.
 *
 * Renders nothing at all when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, which
 * is what makes local development and preview deploys usable without keys -
 * matched by the server, which lets a request through when its own secret is
 * missing. Both halves have to be configured for the check to exist, and
 * lib/server/turnstile.ts explains why a half-configured state is worse than
 * an unconfigured one.
 *
 * The script is loaded here rather than in the root layout so that a
 * third-party script is only ever fetched on the one page that needs it -
 * nobody playing a chart should be loading Cloudflare's bot script.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const holder = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !holder.current) return;

    let cancelled = false;

    const render = () => {
      if (cancelled || !holder.current || !window.turnstile) return;
      if (widgetId.current) return;
      widgetId.current = window.turnstile.render(holder.current, {
        sitekey: siteKey,
        // Token is single use and short lived; expiry must clear it, or the
        // form would submit a token the server will reject.
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => {
          onToken(null);
          setFailed(true);
        },
        theme: "light",
      });
    };

    if (window.turnstile) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    script.addEventListener("error", () => setFailed(true));

    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;

  return (
    <div className="field">
      <div ref={holder} />
      {failed ? (
        <p className="note" role="status">
          The bot check could not load. Disable any script blocker for this
          page and reload.
        </p>
      ) : null}
    </div>
  );
}
