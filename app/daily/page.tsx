import { redirect } from "next/navigation";

/**
 * "Daily shouldn't be a separate tab" (2026-08-26). The daily-play
 * experience now lives on the home page itself for signed-in players (see
 * components/SignedInPlay.tsx) - any 3 distinct charts completed in a day
 * count toward the streak, not a specific pre-selected five. This route is
 * kept as a redirect, not deleted outright, in case anything still links or
 * is bookmarked to /daily.
 */
export default function DailyPage() {
  redirect("/");
}
