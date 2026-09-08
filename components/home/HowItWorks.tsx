import { Reveal } from "@/components/home/Reveal";

/**
 * Three steps, in bordered white cards with a solid yellow offset.
 *
 * The earlier version rotated each card a degree or two. That is gone: the
 * design mock keeps every card square, and the depth comes entirely from the
 * offset shadow. Tilting them as well made the offsets look like a mistake
 * rather than a decision.
 */
const STEPS = [
  {
    n: "01",
    title: "See the trend",
    text: "A real series from a government or research source, cut off at the point people usually start getting it wrong. No title giving away the answer.",
  },
  {
    n: "02",
    title: "Draw the line",
    text: "Drag straight through to the right edge. Wherever you think it went - steady, falling off a cliff, climbing. Your line is your answer.",
  },
  {
    n: "03",
    title: "Watch it reveal",
    text: "The real line prints over yours. Then you find out whether you were wrong in the same direction as everyone else.",
  },
];

export function HowItWorks() {
  return (
    <section className="band" aria-labelledby="how-heading">
      <div className="shell">
        <Reveal>
          <div className="section-head">
            <div className="stack-3">
              <p className="eyebrow">How it works</p>
              <h2 id="how-heading" className="title">
                Three steps, about a minute.
              </h2>
            </div>
            <p className="marker marker--pink" aria-hidden="true">
              Draw / see
            </p>
          </div>
        </Reveal>

        <ul className="step-grid">
          {STEPS.map((step, i) => (
            <Reveal
              as="li"
              key={step.n}
              delay={i * 0.09}
              className="card card--offset-yellow card--lift"
            >
              <span className="step-card-n">{step.n}</span>
              <h3 className="step-card-title">{step.title}</h3>
              <p className="step-card-text">{step.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
