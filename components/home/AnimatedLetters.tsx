"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Per-letter entrance AND a continuous colour cycle.
 *
 * The reference for this is Jelly Studio's headline treatment, which gets
 * its character from giving each LETTER its own typeface. This project has
 * one display face (and no webfonts loaded at all yet), so the variation
 * here comes from motion and colour instead of from type - which is what
 * the human actually asked for: "moving letters that change colours."
 *
 * COLOUR RULE, and it is a real one - see docs/DESIGN.md. --ink-truth means real
 * data and nothing else, so it never appears in the decorative cycle.
 * `accentFrom` marks the run of words that literally refers to the true
 * value ("...the number?"); those letters take the truth ink and hold it,
 * and every other letter drifts through the bright riso inks, which carry
 * no data meaning at all.
 *
 * ACCESSIBILITY: splitting a word into per-character elements makes some
 * screen readers announce it letter by letter. The wrapper carries the
 * whole string as its accessible name and every character span is
 * aria-hidden, so assistive tech reads one phrase and sees none of the
 * splitting.
 *
 * REDUCED MOTION: renders the plain string, unsplit - no per-letter DOM and
 * no colour animation, which removes the accessibility hazard above rather
 * than merely masking it.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Named as CSS custom properties, so the browser resolves them and this
 * file still contains no hex value - colour stays defined in tokens.css
 * only, which is what scripts/check-design.sh enforces.
 */
const CYCLE = [
  "var(--riso-blue)",
  "var(--riso-purple)",
  "var(--riso-teal)",
  "var(--riso-green)",
  "var(--riso-violet)",
];

export function AnimatedLetters({
  text,
  className,
  /** Index of the first character that refers to the true value, if any. */
  accentFrom,
  /** Seconds before the first letter moves. */
  delay = 0,
}: {
  text: string;
  className?: string;
  accentFrom?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    if (accentFrom === undefined) return <span className={className}>{text}</span>;
    return (
      <span className={className}>
        {text.slice(0, accentFrom)}
        <span className="letter--truth">{text.slice(accentFrom)}</span>
      </span>
    );
  }

  const chars = Array.from(text);

  return (
    <span className={className} aria-label={text} role="text">
      {chars.map((char, i) => {
        const isAccent = accentFrom !== undefined && i >= accentFrom;

        /*
         * A space has no glyph to colour, so animating one is wasted work.
         * The rotated array ends on the colour it began with, which is what
         * makes the repeat seamless rather than snapping back. Starting each
         * letter at a different offset keeps the line perpetually mid-blend
         * instead of every letter flashing in unison.
         */
        const cycles = !isAccent && char !== " ";
        const offset = i % CYCLE.length;
        const ordered = cycles
          ? [...CYCLE.slice(offset), ...CYCLE.slice(0, offset), CYCLE[offset]]
          : undefined;

        return (
          <motion.span
            key={`${char}-${i}`}
            aria-hidden="true"
            className={isAccent ? "letter letter--truth" : "letter"}
            initial={{ opacity: 0, y: "0.35em" }}
            animate={{
              opacity: 1,
              y: 0,
              ...(ordered ? { color: ordered } : {}),
            }}
            transition={{
              // Per letter, so the phrase resolves left to right rather than
              // all at once.
              opacity: { duration: 0.45, delay: delay + i * 0.022, ease: EASE },
              y: { duration: 0.45, delay: delay + i * 0.022, ease: EASE },
              ...(ordered
                ? {
                    color: {
                      duration: CYCLE.length * 2.4,
                      repeat: Infinity,
                      ease: "linear",
                    },
                  }
                : {}),
            }}
          >
            {char === " " ? " " : char}
          </motion.span>
        );
      })}
    </span>
  );
}
