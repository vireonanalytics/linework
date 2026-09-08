import { Reveal } from "@/components/home/Reveal";

/**
 * The credibility section, on the dark band.
 *
 * Layout from the mock: marker heading in a narrow left column, prose in a
 * wider right column, one oversized violet "GUESS" running behind the whole
 * thing, and the closing line pulled out in yellow.
 *
 * The graffiti here sits at 0.5 opacity rather than the hero's 0.14 - on a
 * near-black ground a violet that faint disappears completely, and the mock
 * measures it much stronger for exactly that reason.
 *
 * PLACEHOLDER COPY: written to be accurate about what the project does
 * rather than to be impressive, so it is safe to ship if it never gets
 * replaced - but it is expected to be replaced.
 */
export function TheIdea() {
  return (
    <section
      className="band band--dark"
      aria-labelledby="idea-heading"
      style={{ position: "relative", overflow: "hidden" }}
    >
      {/*
        Anchored to the RIGHT edge and allowed to run off it, exactly as the
        mock places it. The previous version anchored from the left at 20%,
        which walked the word straight across the prose column and made both
        the heading and the paragraphs hard to read - reported directly.
      */}
      <p className="graffiti-single" aria-hidden="true">
        GUESS
      </p>

      <div className="shell">
        <div className="why-grid">
          <Reveal className="stack-4">
            <p className="eyebrow">Why this exists</p>
            <h2 id="idea-heading" className="marker marker--narrow">
              The gap is measurable.
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="stack-5">
            <p className="prose">
              Most public misperception research asks people to pick a number
              from a list. That tells you they were wrong. It does not tell
              you what shape they thought the world had.
            </p>
            <p className="prose">
              Drawing does. Every line here is stored as a curve - not a
              single guess, but a whole belief about direction, speed, and
              where things settled. Aggregated across enough people, that
              becomes something you cannot get from a multiple-choice poll: a
              picture of the trend the public believes in, laid directly over
              the one that happened.
            </p>
            <p className="why-pull">
              The findings are the point. The game is how they get collected.
            </p>
            {/*
              Credit where it is due, and specific rather than vague. The
              draw-the-line-then-reveal mechanic is not this project's idea:
              it is the New York Times "You Draw It" format, first published
              in 2015 by Gregor Aisch, Amanda Cox and Kevin Quealy - which
              also showed readers how everyone else had drawn it, the same
              crowd comparison this project is built around. Linework is an
              independent project and is not affiliated with them; saying so
              in the same breath keeps the credit from reading as a claim of
              endorsement.
            */}
            <p className="prose credit">
              The draw-then-reveal format was pioneered by The New York Times
              in{" "}
              <a
                href="https://www.nytimes.com/interactive/2015/05/28/upshot/you-draw-it-how-family-income-affects-childrens-college-chances.html"
                target="_blank"
                rel="noreferrer noopener"
              >
                You Draw It
              </a>{" "}
              (Gregor Aisch, Amanda Cox and Kevin Quealy, 2015). Linework is
              an independent project, not affiliated with or endorsed by them.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
