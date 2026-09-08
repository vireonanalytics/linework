import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/contact";
export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Legal</p>
          <h1 className="title">Terms of Use</h1>
          <p className="admin-row-meta">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>

        {/* See the note in app/legal/privacy/page.tsx for why this banner went. */}
        <section className="stack-2" aria-label="About these terms">
          <p className="note">
            Written in plain language rather than boilerplate. Questions to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            .
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">What this project is</h2>
          <p className="note">
            Linework is a game: you predict how a real trend continues,
            then see the truth. The two starter charts
            require no account at all. Continuing to play beyond those two
            charts requires an account.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">Your account</h2>
          <p className="note">
            You are responsible for keeping your password confidential.
            Display names and other profile fields must not impersonate
            another person or contain content that is abusive, illegal, or
            infringing. We may suspend or remove an account that violates
            this.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">The data you contribute</h2>
          <p className="note">
            When you draw a prediction, that path - along with basic timing
            information and, if you are signed in, a link to your account -
            is recorded. See the <a href="/legal/privacy">privacy policy</a>{" "}
            for exactly what is and is not stored. By using this site you
            agree that aggregated, de-identified drawing data may be
            published or licensed for research purposes, as described there.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">The datasets themselves</h2>
          <p className="note">
            Charts on this site are drawn from public statistical sources,
            cited on each chart and in this project&apos;s source records.
            Every dataset is marked as verified or unverified; unverified
            datasets are not shown as part of normal play. We make a good
            effort to source data accurately but do not guarantee it is free
            of error - see the methodology note on each verified chart for
            specifics.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">No warranty</h2>
          <p className="note">
            This site is provided as-is, without warranty of any kind, to the
            extent permitted by law. We are not liable for any decision made
            based on a chart, a score, or any aggregate statistic shown here.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">Changes</h2>
          <p className="note">
            These terms may change as the project develops. Continued use
            after a change means you accept the updated terms.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">Contact</h2>
          <p className="note">
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

      </div>
    </main>
  );
}
