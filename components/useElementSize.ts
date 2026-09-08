"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartSize } from "@/lib/chart/geometry";

/**
 * Measures an element and re-measures on resize and orientationchange.
 *
 * Geometry is rebuilt from this on every change, so nothing derived from a
 * stale size can survive a rotation.
 */
export function useElementSize<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ChartSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) => {
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (previous && previous.width === width && previous.height === height) {
          return previous;
        }
        return { width, height };
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    // ResizeObserver covers most rotations, but iOS Safari can settle its
    // layout a beat after the orientation event, so re-measure explicitly.
    const onOrientationChange = () => {
      measure();
      window.setTimeout(measure, 250);
    };

    window.addEventListener("orientationchange", onOrientationChange);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", onOrientationChange);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, size } as const;
}
