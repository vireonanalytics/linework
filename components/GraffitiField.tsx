/**
 * The floating marker words. Four marks that drift slowly and continuously
 * behind whatever they sit under.
 *
 * Every value here was measured off the human's Repaint mock rather than
 * estimated - positions, per-mark font sizes, the three drift keyframes and
 * their individual durations (20s / 24s / 18s / 26s, all `alternate` so each
 * mark eases back and forth rather than snapping at the end of a cycle).
 * See `.graffiti-mark*` in globals.css for the styling half.
 *
 * Used in two places: behind the anonymous hero, and behind the signed-in
 * play view, so a returning player gets the same treatment rather than a
 * bare page.
 *
 * A server component - there is no state here, only decoration, and the
 * animation is pure CSS. `aria-hidden` because it is texture: a screen
 * reader announcing "GUESS ACTUALLY DRAW REAL" ahead of the real content
 * would be noise.
 */
const MARKS = [
  { text: "Guess", place: "graffiti-mark--one" },
  { text: "Actually", place: "graffiti-mark--two graffiti-mark--outline" },
  { text: "Draw", place: "graffiti-mark--three graffiti-mark--yellow" },
  { text: "Real", place: "graffiti-mark--four graffiti-mark--outline" },
] as const;

export function GraffitiField() {
  return (
    <div className="graffiti-field" aria-hidden="true">
      {MARKS.map((mark) => (
        <span key={mark.text} className={`graffiti-mark ${mark.place}`}>
          {mark.text.toUpperCase()}
        </span>
      ))}
    </div>
  );
}
