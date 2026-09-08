import type { NextConfig } from "next";

/**
 * Security response headers.
 *
 * This file was empty until 2026-08-27, which meant the app shipped with no
 * clickjacking protection, no MIME-sniffing protection, no referrer policy
 * and no Content-Security-Policy. None of those are exotic - they are the
 * baseline every site is expected to send, and their absence is the first
 * thing any scanner reports.
 *
 * Each header below is here for a specific reason, not as boilerplate.
 */
const securityHeaders = [
  /*
   * The app is never legitimately framed by anyone. Without this, an
   * attacker can load Linework in a transparent iframe over their own page
   * and harvest clicks - including, here, clicks on the drawing surface,
   * which would let them submit guesses in a signed-in visitor's name.
   * frame-ancestors in the CSP below is the modern equivalent; both are sent
   * because older browsers only honour this one.
   */
  { key: "X-Frame-Options", value: "DENY" },

  /*
   * Stops the browser second-guessing a Content-Type. Relevant because the
   * admin export route returns attacker-influenced text (display names,
   * cities) as text/csv - without this a browser could decide a crafted
   * export was HTML and execute it.
   */
  { key: "X-Content-Type-Options", value: "nosniff" },

  /*
   * Send the full URL only to ourselves; send just the origin cross-site.
   * Guess and admin URLs contain dataset slugs, and admin analysis URLs
   * would otherwise leak in the Referer of any outbound source link.
   */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  /*
   * This app needs none of these. Denying them means a successful script
   * injection still cannot reach a camera, a microphone or a location.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  /*
   * Two years, subdomains included, preload-eligible. Vercel already serves
   * HTTPS only; this stops a first request over plain HTTP from being
   * downgraded or intercepted.
   */
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },

  /*
   * Content-Security-Policy.
   *
   * 'unsafe-inline' on style-src is required: Next injects inline styles,
   * and every chart in this project positions elements with inline style
   * attributes. Removing it would need a nonce threaded through the whole
   * render, which is a real project, not a config line.
   *
   * script-src keeps 'unsafe-inline' for the same reason (Next's bootstrap
   * script) and adds 'unsafe-eval' ONLY outside production - the dev server
   * needs it for React Fast Refresh, and shipping it to production would
   * hand an injected script the ability to build new code from strings.
   *
   * Everything else is locked to same-origin. Note what is absent:
   * connect-src allows only 'self', so an injected script cannot exfiltrate
   * drawn paths or session data to another host.
   */
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      /*
       * challenges.cloudflare.com is Turnstile, the bot check on signup. It
       * needs three directives: the script itself, an iframe to run the
       * challenge in, and a connection back to report the result. Nothing
       * else is added, and every other origin stays blocked - in particular
       * connect-src still permits only 'self' and Turnstile, so an injected
       * script has nowhere to send stolen data.
       */
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework. Minor, but there is no reason to tell a
  // scanner which stack to look up known issues for.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /**
   * One canonical address: linework.cc.
   *
   * The Vercel subdomain still resolves and Vercel will happily serve the
   * whole site from it, which means two fully working copies of a research
   * project - split search ranking, and citations pointing at a URL that is
   * an implementation detail rather than the product. A 308 makes the old
   * address a pointer instead of a twin.
   *
   * Matched on the HOST header rather than by rewriting links, so it also
   * catches deep links people have already shared, and it preserves the path
   * and query - a reset link sent to the old domain still lands on the right
   * page with its token intact.
   *
   * Preview deployments are deliberately NOT redirected: they have their own
   * generated hostnames, and sending them to production would make every
   * preview untestable.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "draw-the-line.vercel.app" }],
        destination: "https://linework.cc/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.linework.cc" }],
        destination: "https://linework.cc/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
