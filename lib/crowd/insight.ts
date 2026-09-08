/**
 * Turns an aggregate mean signed error into the one-sentence, plain-language
 * claim this whole project exists to produce - "on average, people
 * over/underestimated this trend." This is the research output, not a
 * per-player result: lib/crowd/compare.ts's biasFrom() judges ONE guess
 * against the truth; this judges the AVERAGE of every clean guess against
 * the truth.
 *
 * Pure - takes the already-aggregated avgSignedError (same 0..1 normalised
 * scale as an individual guess's meanSignedError; positive = the crowd drew
 * above the truth on average, negative = below) and the clean sample size.
 * Knows nothing about Postgres or the admin UI.
 */

/**
 * Same threshold as DrawTheLine.tsx's own "drew too high/low" read-out
 * (0.01 on the 0..1 scale), so an individual result and this aggregate
 * finding never use different definitions of "on target."
 */
const BIAS_EPSILON = 0.01;

export function inferBiasStatement(
  avgSignedError: number | null,
  cleanN: number,
): string {
  if (cleanN === 0 || avgSignedError === null) {
    return "No clean responses yet - nothing to infer.";
  }

  if (Math.abs(avgSignedError) <= BIAS_EPSILON) {
    return `On average, respondents were accurate here - guesses landed close to the real trend (n=${cleanN}).`;
  }

  const direction = avgSignedError > 0 ? "overestimated" : "underestimated";
  const points = (Math.abs(avgSignedError) * 100).toFixed(1);

  return `On average, respondents ${direction} this trend by about ${points} points on the chart's normalized 0-100 scale (n=${cleanN}).`;
}
