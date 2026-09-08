import { Reveal } from "@/components/home/Reveal";

/**
 * The endpoint of the scroll, on the yellow band. Giant marker headline
 * left, prose and buttons right - the mock's arrangement.
 *
 * The headline is one string that WRAPS inside its 0.8fr column - that is
 * what stacks it one word per line at this size, and it is how the mock
 * does it. An earlier version hard-coded a <br /> per word, which produced
 * the right shape at exactly one viewport width and a broken one at all
 * the others.
 *
 * This is the SECOND signup ask on the page - FirstRunGate turns into a
 * signup wall in place once a visitor finishes both intro charts. The two are
 * worded differently on purpose: that one speaks to someone who just played
 * and has momentum, this one to someone who read the page instead.
 */
export function SecondCta() {
  return (
    <section className="band band--yellow" aria-labelledby="cta-heading">
      <div className="shell">
        <div className="cta-grid">
          <Reveal>
            <h2 id="cta-heading" className="cta-headline">
              Find out how wrong you are.
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="stack-6">
            <p className="question">
              An account keeps your streak, remembers which charts you have
              already answered, and adds your lines to the aggregate.
            </p>
            <div className="controls">
              <a className="button button--primary" href="/signup">
                Create an account
              </a>
              <a className="button" href="/signin">
                Sign in
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
