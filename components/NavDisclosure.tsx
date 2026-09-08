"use client";

import { useState } from "react";

/**
 * Collapses the nav behind a button on small screens.
 *
 * SiteNav is a server component (it reads the session), so the links are built
 * there and handed in as children. Only this wrapper is a client component,
 * which keeps the "no client-side flash of the wrong signed-in state" property
 * the nav has had since it was written.
 *
 * A button rather than a CSS-only <details>: the UA stylesheet hides a
 * details' non-summary children when closed, and forcing them visible again at
 * desktop widths is unreliable across browsers.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A PLAIN BOOLEAN AND NOT DERIVED FROM THE PATHNAME
 * ---------------------------------------------------------------------------
 * It was `open = (openedOn === pathname)`, which closed on navigation without
 * needing an effect. That was neat and wrong in two reported ways:
 *
 *  - Signing out redirects to "/" from "/", so the pathname never changed and
 *    the panel stayed open over the page.
 *  - Worse, the memory persisted: this component lives in the layout and is
 *    not remounted between pages, so a menu opened on "/" would RE-OPEN by
 *    itself every time the user came back to "/".
 *
 * Closing on the click instead covers every way out of the menu, because every
 * one of them is a click on a link or a button - including the sign-out form,
 * which is a submit button inside the panel. No effect, so the React compiler
 * rule about setState-in-effect is not in play either.
 */
export function NavDisclosure({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="site-nav-toggle"
        aria-expanded={open}
        aria-controls="site-nav-links"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav
        id="site-nav-links"
        className={`site-nav-links${open ? " is-open" : ""}`}
        aria-label="Main navigation"
        onClick={(event) => {
          /*
           * Anything actionable inside the panel ends the menu's job. Checked
           * with closest() so a click on a nested <span> inside a link still
           * counts, while a click on the panel's own padding does not - which
           * would otherwise feel like the menu closing at random.
           */
          const target = event.target as HTMLElement;
          if (target.closest("a, button")) setOpen(false);
        }}
      >
        {children}
      </nav>
    </>
  );
}
