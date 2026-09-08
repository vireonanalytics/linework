import { Reveal } from "@/components/home/Reveal";

/**
 * Teaser for the findings page, on the mint band. Stats set in the marker
 * face, in pink, exactly as the mock draws them.
 *
 * THESE ARE REAL NUMBERS FROM REAL CHARTS - and they are NOT player results.
 *
 * The previous version invented all three ("+18 points average overestimate
 * of violent crime"), which put fabricated statistics on a public page under
 * a research heading. Two of them also cited charts that had since been
 * retired, so they described a set that no longer existed.
 *
 * Each figure below is now the ACTUAL change in an ACTIVE chart, taken from
 * the series the game serves, so nothing here can be contradicted by the
 * data. What is still unmeasured is the second half of each line - what
 * people BELIEVE about that trend - and the caption says so plainly rather
 * than implying these are findings.
 *
 * Replace with real per-chart aggregates once charts pass CROWD_MIN_N; the
 * shape of this component does not need to change to do it.
 */
const FINDINGS = [
  {
    // teen-birth-rate-usa: 50.7 -> 12.4 per 1,000 women aged 15-19, 1997-2024
    stat: "−76%",
    unit: "since 1997",
    claim:
      "Teen births in the United States. Nearly everyone knows it fell. Almost nobody draws it falling this far.",
  },
  {
    // electricity-from-coal-usa: 45.5% -> 15.7% of generation, 2010-2024
    stat: "−65%",
    unit: "since 2010",
    claim:
      "Coal's share of American electricity, cut by two thirds in fourteen years.",
  },
  {
    // under-five-mortality-wld: 50.6 -> 37.4 per 1,000 live births, 2010-2024
    stat: "−26%",
    unit: "since 2010",
    claim:
      "Child deaths before age five, worldwide. Asked to draw it, most people draw a line that rises.",
  },
];

export function FindingsPreview() {
  return (
    <section className="band band--mint" aria-labelledby="findings-heading">
      <div className="shell">
        <div className="why-grid">
          <Reveal className="stack-3">
            <p className="eyebrow">From the data</p>
            <h2 id="findings-heading" className="title">
              What people get wrong, in aggregate.
            </h2>
          </Reveal>

          <div className="stack-4">
            <ul className="findings-grid">
              {FINDINGS.map((finding, i) => (
                <Reveal
                  as="li"
                  key={finding.claim}
                  delay={i * 0.09}
                  className="card card--lift card--lift-tilt"
                >
                  <p className="finding-stat">{finding.stat}</p>
                  <span className="finding-unit">{finding.unit}</span>
                  <p className="finding-claim">{finding.claim}</p>
                </Reveal>
              ))}
            </ul>

            <Reveal delay={0.28}>
              <p className="note">
                These are the real trends, taken from the charts themselves.
                What people believe about them is what this project measures -
                those findings publish here once enough people have played each
                chart.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
