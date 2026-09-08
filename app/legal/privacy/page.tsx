import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/contact";
export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Legal</p>
          <h1 className="title">Privacy Policy</h1>
          <p className="admin-row-meta">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>

        {/*
          The "not reviewed by a lawyer" banner was removed on the human's
          instruction (2026-08-27): nothing is charged for, so they judged the
          disclaimer more alarming than useful to a reader.

          What replaces it is a plain statement of what the page IS, which is
          the part that was actually load bearing - a reader should know this
          describes real behaviour rather than being boilerplate copied from
          elsewhere. The underlying fact has not changed and is still recorded
          in LAUNCH_CHECKLIST.md: this has had no legal review, which matters
          before any commercial use, any licensing of data to a third party,
          or traffic from a jurisdiction with its own requirements.
        */}
        <section className="stack-2" aria-label="About this policy">
          <p className="note">
            Written in plain language to describe what this project actually
            collects and does with it, rather than to cover every eventuality.
            If anything here is unclear or looks wrong, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
            and it will be fixed.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">What we collect, and why</h2>
          <p className="note">
            We are not going to claim this project collects &quot;no
            PII.&quot; That claim would be false the moment someone creates an
            account - an email address and other fields below are personal
            information. Here is exactly what exists, in two separate
            categories:
          </p>

          <h3 className="metric-term" style={{ marginTop: "var(--space-3)" }}>
            If you play without an account
          </h3>
          <p className="note">
            An anonymous, randomly generated session identifier (a cookie),
            not tied to your name or email. The 40-point path you draw. Timing
            of your draw and how many times you redrew. A coarse device type
            (mobile/tablet/desktop) and a two-letter country code, both
            estimated from your connection, never a precise location. A
            salted, one-way hash of your browser&apos;s user agent string -
            the raw string is never stored. We do not store your IP address.
          </p>

          <h3 className="metric-term" style={{ marginTop: "var(--space-3)" }}>
            If you create an account
          </h3>
          <p className="note">
            Everything above, plus: your <strong>email address</strong>{" "}
            (required, used only to sign you in), a{" "}
            <strong>display name</strong> you choose (not your legal name),
            optionally the <strong>year you were born</strong> (not your full
            birth date), and optionally a <strong>city and state</strong>{" "}
            (US only, chosen from a fixed list, not typed freely). All of
            these except email are self-reported and{" "}
            <strong>unverified</strong> - we do not check that they are
            accurate, and nothing in this project should be read as
            confirming that they are. If the location you enter does not
            match where your connection appears to be coming from, we store a
            flag noting that mismatch; it does not block you from playing,
            and rows flagged this way are excluded from location-based
            findings by default.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">What this data is used for</h2>
          <p className="note">
            The drawn paths are the actual point of this project: at scale,
            they become a dataset of how accurately people predict real
            trends, and where the biggest gaps are. Aggregated, anonymized
            drawing data{" "}
            <strong>may be published or licensed to third parties</strong>{" "}
            later, including as a research dataset - this is a stated goal of
            the project, not a hidden one. Anything published this way is
            aggregate statistics, not individual identifiable rows: no email
            address, no display name, and no single guess tied to a person
            leaves this project as part of that publication.
          </p>
          <p className="note">
            Account fields (email, display name, birth year, city/state) are
            used to run the account itself - signing you in, showing your
            streak, letting you edit your profile - and, in aggregate and
            de-identified form, for the same kind of research described
            above (for example, &quot;does perception of this trend differ by
            age bracket,&quot; never &quot;what did this specific person
            draw&quot;).
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">Analytics</h2>
          <p className="note">
            We use Vercel Web Analytics to count page views and see which
            charts people play. It is <strong>cookieless</strong>: it sets
            nothing on your device, assigns you no identifier, and cannot
            follow you to other sites. It records the page visited, the
            referring site, and coarse device and country information - the
            same kind of detail described above, and never anything you drew
            or typed.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">What we do not do</h2>
          <p className="note">
            We do not sell your email address. We do not collect your full
            legal name or full date of birth - only a display name and,
            optionally, a birth year. We do not store raw IP addresses or raw
            browser user-agent strings. We do not use your data to serve you
            ads.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">Your choices</h2>
          <p className="note">
            You can play the first two charts on this site without an account
            at all. You can edit your profile fields at any time from your{" "}
            <a href="/account">account page</a>. To request deletion of your
            account, contact us using the address below.
          </p>
        </section>

        <section className="stack-2">
          <h2 className="question">Contact</h2>
          <p className="note">
            Questions about this policy, or a request to delete your data:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

      </div>
    </main>
  );
}
