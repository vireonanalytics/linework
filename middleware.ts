import { NextResponse, type NextRequest } from "next/server";
import {
  REFERRER_COOKIE,
  SESSION_COOKIE,
  isValidSessionId,
  newSessionId,
  sessionCookieOptions,
} from "@/lib/server/session";

/**
 * Mint the anonymous session on first visit.
 *
 * This runs on the edge and touches no database on purpose. Two reasons:
 *
 * 1. A database write on every page view would put Postgres in the critical
 *    path of the first paint, and would create a row for every crawler that
 *    never draws anything. The sessions row is created lazily, on the first
 *    guess, from the same headers.
 *
 * 2. The inbound referrer is only visible on the FIRST request. By the time a
 *    guess is posted, the referrer is our own page. So it is captured here and
 *    parked in a second cookie for the API route to read - host only, never a
 *    full URL with its query string.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionId(existing)) return response;

  const options = sessionCookieOptions(request.url);
  response.cookies.set(SESSION_COOKIE, newSessionId(), options);

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const host = new URL(referer).hostname.toLowerCase();
      if (host && host !== request.nextUrl.hostname.toLowerCase()) {
        response.cookies.set(REFERRER_COOKIE, host, {
          ...options,
          httpOnly: true,
        });
      }
    } catch {
      // An unparseable referer is not worth recording.
    }
  }

  return response;
}

export const config = {
  /*
   * Pages only. Static assets and the API do not need a session minted, and
   * running middleware on every image is pure latency.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
