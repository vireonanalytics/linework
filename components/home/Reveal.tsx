"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * The one scroll-triggered reveal used across the homepage narrative.
 *
 * Every below-fold section wraps its children in this rather than each
 * section inventing its own entrance, so the whole page shares one timing
 * curve and one idea of what "arriving" looks like. The curve is the same
 * cubic-bezier the chart reveal already uses (--reveal-ease in tokens.css),
 * written out here because a JS transition cannot read a CSS custom
 * property.
 *
 * REDUCED MOTION: returns a plain element with no motion component at all -
 * content is simply present, not animated more slowly. That is the explicit
 * requirement, and it is also why this returns early rather than setting a
 * zero duration: a zero-duration animation still runs, still fires layout
 * work, and still starts from an opacity of 0 if anything goes wrong.
 *
 * `once: true` matters for a research tool: an element that re-animates
 * every time it re-enters the viewport is distracting when someone is
 * scrolling back to re-read something.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  /** Seconds. Stagger within a section by passing index * 0.08 or similar. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const reduce = useReducedMotion();

  const Motion = motion[as];
  const Plain = as;

  if (reduce) return <Plain className={className}>{children}</Plain>;

  return (
    <Motion
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </Motion>
  );
}
