import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { NavDisclosure } from "@/components/NavDisclosure";

/**
 * Wordmark left, links right, one filled call to action - the arrangement
 * from the design mock.
 *
 * The icon mark that used to sit before the wordmark is gone (2026-08-27) -
 * it came from the Repaint mock by mistake and was never meant to be part of
 * the identity. The wordmark alone is the logo.
 *
 * PLAY SITS OUTSIDE THE COLLAPSIBLE MENU, beside the wordmark, and never
 * collapses (2026-08-28). Two reasons: it is the way back to the game, so
 * hiding it behind a Menu button on the exact device where the game is played
 * is the wrong trade; and inside the dropdown it was the only row carrying its
 * own filled style, which made it sit visibly out of line with the plain rows
 * around it. Out here that style is correct rather than anomalous.
 *
 * Link order was specified directly (2026-08-28):
 *   signed out - Contact, Sign in, Sign up
 *   signed in  - Your answers, Account, Admin, Contact, Sign out
 * The mobile panel is the same list in a column, so it reads top to bottom in
 * that order automatically - there is no second ordering to keep in sync.
 */
export async function SiteNav() {
  const session = await auth();

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <div className="site-nav-brand-group">
          <Link href="/" className="site-nav-brand" aria-label="Linework home">
            <span className="site-nav-wordmark">Linework</span>
          </Link>
          {/*
            One persistent way back to the game, beside the wordmark, for
            everyone: PLAY for a signed-in player, HOME for a visitor. Same
            treatment, because it does the same job - and it is why no page
            needs its own back link (the Contact page had one until this
            landed).
          */}
          <Link href="/" className="site-nav-play">
            {session?.user ? "Play" : "Home"}
          </Link>
        </div>

        <NavDisclosure>
          {session?.user ? (
            <>
              <Link href="/history">Your answers</Link>
              <Link href="/account">Account</Link>
              {session.user.role === "admin" ? <Link href="/admin">Admin</Link> : null}
              <Link href="/contact">Contact</Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="site-nav-link-button">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/contact">Contact</Link>
              <Link href="/signin">Sign in</Link>
              <Link href="/signup" className="site-nav-cta">
                Sign up
              </Link>
            </>
          )}
        </NavDisclosure>
      </div>
    </header>
  );
}
