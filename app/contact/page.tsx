import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = {
  title: "Contact",
  description: "Get in touch about Linework - questions, corrections, data requests.",
};

/**
 * A page rather than a bare mailto link in the footer.
 *
 * This project asks people for an email address, a birth year and a city, and
 * says it intends to publish aggregated findings. Somewhere to actually reach
 * a human is part of that bargain, not a nicety - and a page can say what to
 * expect (what to include, what gets answered) in a way a mailto cannot.
 *
 * No contact FORM, deliberately. A form needs its own spam handling, its own
 * rate limiting and its own store of message bodies - a third place holding
 * things people wrote. A mailto has none of that and reaches the same inbox.
 */
export default function ContactPage() {
  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          {/* The way back is HOME in the header now, on every page. */}
          <p className="eyebrow">Linework</p>
          <h1 className="title">Get in touch</h1>
          <p className="question">
            Questions, corrections, or a request for the data - all to the same
            place.
          </p>
        </header>

        <section className="card stack-3" aria-label="Email">
          <p className="eyebrow">Email</p>
          <p className="title contact-address">
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <p className="note">
            One person reads this, so a reply may take a few days.
          </p>
        </section>

        <section className="stack-4" aria-label="What to write about">
          <h2 className="question">Things worth writing about</h2>

          <div className="card stack-2">
            <p className="eyebrow">A chart looks wrong</p>
            <p className="note">
              The most useful message this project can get. Every chart names
              its source and links to it - send the chart title and what you
              think is off, and it will be checked against the source. A chart
              that is wrong gets taken out of circulation the same day.
            </p>
          </div>

          <div className="card stack-2">
            <p className="eyebrow">Research and data requests</p>
            <p className="note">
              The aggregated drawings are the point of this project. If you
              want to use them, say what for and what shape you need.
            </p>
          </div>

          <div className="card stack-2">
            <p className="eyebrow">Your account or your data</p>
            <p className="note">
              Deletion, corrections, or a copy of what is held about you. See
              the <Link href="/legal/privacy">privacy policy</Link> for what
              that is.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
