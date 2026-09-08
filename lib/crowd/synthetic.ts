/**
 * ============================================================================
 * FABRICATED DATA. NOT RESPONSES. NOT FINDINGS.
 * ============================================================================
 *
 * Nothing in this file has anything to do with what real people drew. It
 * exists for exactly one reason: to preview how hundreds of stacked paths look
 * through the ink-density rendering, so the design can be judged before Phase 4
 * makes it load-bearing.
 *
 * Rules that keep this from ever being mistaken for real data:
 *
 *  - It is only ever reachable behind an explicit `?preview=crowd` flag.
 *  - Anything rendering it must say on screen that it is synthetic.
 *  - It is never written to a database, never aggregated, never exported, and
 *    never counted toward the n = 50 cold-start threshold.
 *  - It is deterministic from a seed, so it is reproducible and obviously not
 *    a sample of anything.
 *
 * When Phase 4 lands, this file's only remaining job is design regression.
 * If it ever gets imported by something that touches real aggregates, that is
 * a bug, and a serious one.
 */

/** Small, fast, seeded PRNG. Deterministic across platforms. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal, via Box-Muller. */
function gaussian(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export type SyntheticCrowdOptions = {
  /** The real series over the drawable region, as unit values. */
  truth: number[];
  count: number;
  seed?: number;
};

/**
 * Generate `count` plausible-looking wrong answers.
 *
 * The shape of the invention matters, because a crowd that is wrong in a
 * uniformly random direction would make the density plot look like noise and
 * teach us nothing about the rendering. Real misperception is biased: on a
 * series that falls steeply, most people continue the trend they can see and
 * badly undershoot how far it goes. So most of these end too high, a few track
 * it, and a few go the wrong way entirely.
 *
 * That bias is a guess about human behaviour, not a measurement of it. It is
 * here to make the ink stack the way real answers probably will, and for no
 * other reason.
 */
export function syntheticCrowd({
  truth,
  count,
  seed = 20260825,
}: SyntheticCrowdOptions): number[][] {
  const random = mulberry32(seed);
  const points = truth.length;
  const start = truth[0];
  const end = truth[points - 1];
  const fall = start - end;

  const paths: number[][] = [];

  for (let p = 0; p < count; p += 1) {
    // Where they think it ends up. Centred well above the real endpoint.
    const undershoot = gaussian(random) * 0.35 + 0.45;
    const endValue = end + fall * Math.max(-0.25, undershoot);

    // Where they start: at the last known point, give or take a wobble.
    const startValue = start + gaussian(random) * 0.015;

    // Curvature. Below 1 falls fast then flattens; above 1 holds then drops.
    const curve = 0.65 + random() * 1.1;

    // A slow wave along the path, so no two lines are parallel.
    const waveAmplitude = random() * 0.022;
    const wavePhase = random() * Math.PI * 2;
    const waveRate = 1 + random() * 2.5;

    const path = new Array<number>(points);

    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const wave =
        Math.sin(wavePhase + t * Math.PI * waveRate) * waveAmplitude * t;
      path[i] = clamp01(
        startValue + (endValue - startValue) * t ** curve + wave,
      );
    }

    paths.push(path);
  }

  return paths;
}
