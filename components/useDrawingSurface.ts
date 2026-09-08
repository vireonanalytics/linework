"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { clamp, type Geometry } from "@/lib/chart/geometry";
import type { StrokePoint } from "@/lib/drawing/resample";

type Options = {
  geometry: Geometry | null;
  /** When false, pointer input is ignored entirely (e.g. after reveal). */
  enabled: boolean;
  onStart?: () => void;
  onFinish?: (stroke: StrokePoint[], drawMs: number) => void;
};

export type SurfaceHandlers = {
  onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
};

export type DrawingSurface = {
  stroke: StrokePoint[];
  isDrawing: boolean;
  handlers: SurfaceHandlers;
  reset: () => void;
};

/**
 * All pointer handling for the drawing surface, isolated from rendering.
 *
 * Rules this enforces, all of which exist because of touch:
 * - Pointer Events only. One code path for finger, stylus and mouse.
 * - setPointerCapture on down, released on up, so a stroke that leaves the
 *   element still reports moves.
 * - Non-primary pointers are ignored. That is palm rejection, and it also
 *   means a second finger cannot hijack a stroke in progress.
 * - pointercancel is treated exactly like pointerup. iOS fires it whenever the
 *   system interrupts - a call, the app switcher, a gesture the OS claims.
 * - The bounding rect is re-read on every pointerdown and invalidated on
 *   resize, orientationchange and scroll. It is never trusted across those.
 * - x is monotonic. Moving backwards adjusts the current frontier instead of
 *   drawing a line back through time.
 */
export function useDrawingSurface({
  geometry,
  enabled,
  onStart,
  onFinish,
}: Options): DrawingSurface {
  const [stroke, setStroke] = useState<StrokePoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const pointerIdRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const startedAtRef = useRef(0);
  const strokeRef = useRef<StrokePoint[]>([]);

  // Handlers read geometry through a ref so they stay stable across rebuilds.
  // Synced in an effect, which lands after the commit and well before the next
  // pointer event, so a rotation mid-stroke still gets fresh geometry.
  const geometryRef = useRef(geometry);
  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  // Any layout change invalidates the cached rect. The next event re-reads it.
  useEffect(() => {
    const invalidate = () => {
      rectRef.current = null;
    };
    window.addEventListener("resize", invalidate);
    window.addEventListener("orientationchange", invalidate);
    window.addEventListener("scroll", invalidate, true);
    return () => {
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("orientationchange", invalidate);
      window.removeEventListener("scroll", invalidate, true);
    };
  }, []);

  const toLocalPoint = useCallback(
    (
      event: React.PointerEvent<SVGSVGElement>,
      geometryNow: Geometry,
    ): StrokePoint => {
      if (!rectRef.current) {
        rectRef.current = event.currentTarget.getBoundingClientRect();
      }
      const rect = rectRef.current;

      return {
        x: clamp(
          event.clientX - rect.left,
          geometryNow.drawStartX,
          geometryNow.drawEndX,
        ),
        y: clamp(
          event.clientY - rect.top,
          geometryNow.plotTop,
          geometryNow.plotBottom,
        ),
      };
    },
    [],
  );

  const reset = useCallback(() => {
    strokeRef.current = [];
    setStroke([]);
  }, []);

  const finish = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Already released, or the pointer is gone. Either way, carry on.
      }

      pointerIdRef.current = null;
      setIsDrawing(false);

      const finished = strokeRef.current;
      if (finished.length < 2) {
        // A tap, not a stroke. Discard it rather than leaving a dot behind.
        reset();
        return;
      }

      onFinish?.(finished, Math.round(performance.now() - startedAtRef.current));
    },
    [onFinish, reset],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const geometryNow = geometryRef.current;
      if (!enabled || !geometryNow) return;
      if (!event.isPrimary) return;
      if (pointerIdRef.current !== null) return;

      // Re-read on every stroke. Never trust a rect from a previous one.
      rectRef.current = event.currentTarget.getBoundingClientRect();

      const point = toLocalPoint(event, geometryNow);

      event.preventDefault();

      // Safari has historically thrown here when the pointer is no longer
      // considered active by the time the handler runs. Losing capture makes
      // strokes that leave the element stop early; it should not kill the
      // stroke outright.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Continue without capture.
      }

      pointerIdRef.current = event.pointerId;
      startedAtRef.current = performance.now();
      strokeRef.current = [point];

      setStroke([point]);
      setIsDrawing(true);
      onStart?.();
    },
    [enabled, onStart, toLocalPoint],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const geometryNow = geometryRef.current;
      if (!geometryNow) return;
      if (pointerIdRef.current !== event.pointerId) return;
      if (!event.isPrimary) return;

      event.preventDefault();

      const point = toLocalPoint(event, geometryNow);
      const previous = strokeRef.current;
      const last = previous[previous.length - 1];
      if (!last) return;

      const next =
        point.x > last.x
          ? [...previous, point]
          : // Backwards or vertical: adjust the frontier, never draw back in time.
            [...previous.slice(0, -1), { x: last.x, y: point.y }];

      strokeRef.current = next;
      setStroke(next);
    },
    [toLocalPoint],
  );

  return {
    stroke,
    isDrawing,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      // iOS fires pointercancel on interruption. Same path as pointerup.
      onPointerCancel: finish,
    },
  };
}
