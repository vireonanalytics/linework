import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Inter, Permanent_Marker } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * All four faces are downloaded at BUILD time by next/font and served from
 * this project's own origin. Nothing is fetched from Google at runtime, so
 * there is no third-party request on page load, no layout shift waiting on
 * an external host, and no dependency on a CDN staying up.
 *
 * Each exposes a CSS custom property; app/tokens.css is the only place that
 * turns those into the --font-* tokens the rest of the stylesheet reads.
 *
 * Anton stands in for Impact, which the design mock used. Impact is a
 * SYSTEM font: present on macOS and Windows, missing on most Linux and many
 * Android devices, where it silently falls back to Arial Black and renders
 * noticeably wider and lighter. Anton is a near-identical ultra-condensed
 * grotesque, it is free, and self-hosting it means the hero looks the same
 * on the phones most players will actually use. Impact is kept in the
 * fallback stack in tokens.css for the moment before the webfont loads.
 */
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const marker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  // Named "-face" so it does not collide with the --font-marker TOKEN in
  // tokens.css, which reads this and adds the fallback stack. Without the
  // rename the token would reference itself and resolve to nothing.
  variable: "--font-marker-face",
  display: "swap",
});

/**
 * Product name is "Linework" (locked 2026-08-27, replacing the earlier
 * "Overshoot"). The repo, the Vercel project, the Supabase project and the
 * deployed URL all deliberately keep the original `draw-the-line`
 * identifier - a URL is a stable identifier and renaming it breaks every
 * link that already exists for no user-visible gain. Only what a person
 * reads says Linework.
 */
export const metadata: Metadata = {
  title: {
    default: "Linework",
    template: "%s · Linework",
  },
  description:
    "You see the first half of a real chart. Draw where you think it goes next.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays enabled. The drawing surface handles its own gestures via
  // touch-action, so there is no reason to take pinch-zoom away from anyone.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${anton.variable} ${inter.variable} ${plexMono.variable} ${marker.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <SiteNav />
        {children}
        <SiteFooter />
        {/*
          Vercel Web Analytics, loaded as a plain script rather than through
          @vercel/analytics.

          The package exists and is officially supported, but all it does is
          inject this same first-party script - so using the tag directly
          keeps the "ask before adding a dependency" rule intact and, more
          usefully, keeps the CSP untouched: the script is same-origin
          (/_vercel/insights/*), so `script-src 'self'` and
          `connect-src 'self'` already cover it. A third-party analytics
          product would have needed both directives widened.

          Cookieless and with no cross-site identifier, which is why the
          privacy policy can describe it in one sentence rather than needing
          a consent banner.

          Only loaded in production: locally the endpoint does not exist, and
          a 404 on every page view is noise that trains you to ignore the
          console.
        */}
        {process.env.VERCEL_ENV === "production" ? (
          <script defer src="/_vercel/insights/script.js" />
        ) : null}
      </body>
    </html>
  );
}
