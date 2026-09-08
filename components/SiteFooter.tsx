import Link from "next/link";

/**
 * Dark ground, wordmark left, legal links right. Understated on purpose -
 * a footer is where people orient themselves, so nothing here competes.
 *
 * Extracted from app/layout.tsx when the footer gained a background of its
 * own: a full-bleed dark band needs to own its own inner container, and
 * inlining that in the layout was making the layout file about styling.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link href="/" className="site-footer-brand">
          Linework
        </Link>
        {/*
          Sits BETWEEN the wordmark and the legal links, at a smaller size -
          it is an acknowledgement, not navigation, so it should read as an
          aside rather than compete with either neighbour.
        */}
        <p className="site-footer-credit">
          Format inspired by{" "}
          <a
            href="https://www.nytimes.com/interactive/2015/05/28/upshot/you-draw-it-how-family-income-affects-childrens-college-chances.html"
            target="_blank"
            rel="noreferrer noopener"
          >
            The New York Times &ldquo;You Draw It&rdquo;
          </a>
          . Independent project, not affiliated with NYT.
        </p>

        <nav className="site-footer-links" aria-label="Footer navigation">
          <Link href="/contact">Contact</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
