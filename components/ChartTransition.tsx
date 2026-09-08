"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";

/**
 * The answered chart turns away like a page in a book, revealing the next one
 * underneath.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PREVIOUS VERSION STILL FELT ABRUPT
 * ---------------------------------------------------------------------------
 * It used `mode="wait"`, which unmounts the outgoing chart completely before
 * mounting the incoming one. For the duration of that gap the container had
 * NO CHILD, so it collapsed from ~600px to zero and everything below it -
 * the whole rest of the page - jumped up and then back down again. That
 * vertical lurch was the abruptness, far more than the 280ms fade was.
 *
 * So the two charts now overlap in a single grid cell instead. The container
 * is always at least as tall as one of them, nothing below it moves, and the
 * old page can be seen turning away over the new one.
 *
 * ---------------------------------------------------------------------------
 * WHY OVERLAPPING IS SAFE HERE, WHEN IT WOULD NOT HAVE BEEN BEFORE
 * ---------------------------------------------------------------------------
 * Two live drawing surfaces at once is genuinely dangerous in this project:
 * useDrawingSurface converts a pointer's clientX/clientY into chart
 * coordinates via getBoundingClientRect(), and that rect reflects any CSS
 * transform. A card mid-rotation reports a skewed, scaled box, so a stroke
 * drawn during the animation would be silently recorded at the wrong
 * coordinates - corrupting a row in the research dataset rather than just
 * looking wrong.
 *
 * Both halves are therefore inert while moving:
 *   - the outgoing page has pointer-events disabled for its whole exit;
 *   - the incoming page has them disabled until its own animation reports
 *     completion, at which point its transform is identity and its rect is
 *     honest again.
 *
 * (ResizeObserver, which useElementSize relies on for geometry, reports the
 * untransformed layout box, so the chart's own sizing is unaffected either
 * way. It is only the pointer mapping that cares.)
 */
const SPINE_EASE = [0.22, 1, 0.36, 1] as const;

export function ChartTransition({
  transitionKey,
  children,
}: {
  transitionKey: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();

  /*
   * Which key has finished arriving. Anything else is still in flight and
   * must not accept a pointer. Seeded with the first key so the very first
   * chart on a page load is interactive immediately - there is no incoming
   * animation to wait for.
   */
  const [settled, setSettled] = useState(transitionKey);

  /*
   * Reduced motion gets the plain element and no AnimatePresence at all. A
   * full-size card rotating in 3D is exactly the kind of large vestibular
   * movement the preference exists to switch off - a shorter version of it
   * would not do.
   */
  if (reduce) return <div>{children}</div>;

  const isSettled = settled === transitionKey;

  return (
    /*
     * `layout` animates the container's own height change.
     *
     * An ANSWERED chart is meaningfully taller than a fresh one - it carries
     * the score, the metrics grid, the persistence line and the crowd
     * comparison. So when the turn completes the stage has to shrink, and
     * measured without this that was a 180px snap at the very end of an
     * otherwise smooth movement, which read as the animation "finishing
     * badly". Letting the height ease to its new value instead means nothing
     * below the chart ever moves abruptly.
     */
    <motion.div
      className="page-turn"
      layout
      transition={{ duration: 0.5, ease: SPINE_EASE }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={transitionKey}
          className="page-turn-leaf"
          /*
           * Rotated about the LEFT edge - the spine. The incoming page starts
           * slightly open and swings flat; the outgoing one swings further
           * open and lifts away. Rotating about the centre instead reads as a
           * card flip, which is a different (and more restless) gesture.
           */
          initial={{ opacity: 0, rotateY: 12, scale: 0.97, x: 18 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1, x: 0 }}
          exit={{ opacity: 0, rotateY: -26, scale: 0.92, x: -28 }}
          transition={{
            duration: 0.55,
            ease: SPINE_EASE,
            // The arriving page waits a moment so the departing one has
            // visibly begun to turn before it is revealed underneath.
            opacity: { duration: 0.45, ease: "easeOut", delay: 0.08 },
          }}
          style={{
            /*
             * The departing page rides ABOVE the arriving one, so it reads as
             * a leaf lifting off a stack rather than the new chart sliding
             * over the old. AnimatePresence keeps the exiting node mounted,
             * and the entering node is the one matching transitionKey.
             */
            zIndex: isSettled ? 1 : 2,
            pointerEvents: isSettled ? "auto" : "none",
          }}
          onAnimationComplete={() => setSettled(transitionKey)}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
