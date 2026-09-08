/**
 * The shape every chart in the game is built from.
 *
 * Field names are camelCase here and snake_case in Postgres (Phase 3).
 * The mapping is 1:1 except where noted in SCHEMA.md.
 */
export type Dataset = {
  /** URL-safe identifier. Stable forever once published. */
  slug: string;
  /** Short headline shown above the chart. */
  title: string;
  /** The thing we are actually asking the player to predict. */
  question: string;
  /** Y-axis title, e.g. "Births per 1,000 women". */
  yLabel: string;
  /** Unit suffix for numbers, e.g. "per 1,000". */
  yUnit: string;
  /** X-axis categories. Same length as yValues. */
  xValues: string[];
  /** The real series. Same length as xValues. */
  yValues: number[];
  /**
   * Index of the last revealed point. Indices 0..revealFromIndex are drawn as
   * truth; everything after is the drawable region.
   */
  revealFromIndex: number;
  /** [min, max] of the y-axis. Guesses are normalised against this. */
  yDomain: [number, number];
  sourceName: string;
  sourceUrl: string;
  /**
   * False until a human has checked every value against the primary source.
   * scripts/validate-datasets.ts refuses to let an unverified active dataset
   * reach a production build.
   */
  verified: boolean;
  /** ISO date the verification happened, or null. */
  verifiedOn: string | null;
  /** Whether this dataset is served to players. */
  isActive: boolean;
  /**
   * How much the numbers can be trusted. See the migration
   * supabase/migrations/20260827160000_reliability.sql for what each level
   * asserts - in short: green means the source's own values, fetched
   * reproducibly; yellow means real but carrying a named caveat; red means
   * approximated or unconfirmed and not publishable.
   *
   * Separate from `verified`, deliberately. `verified` means a HUMAN checked
   * it; reliability describes where the numbers CAME FROM. An automated
   * import can legitimately be green while still being unverified, and
   * collapsing the two would let a script mark its own output
   * human-approved.
   */
  reliability: "green" | "yellow" | "red";
  /** Why, when the rating is not green. Required for yellow and red. */
  reliabilityNote?: string | null;
  /**
   * Machine-readable provenance for imported series, e.g.
   * "worldbank:SP.DYN.LE00.IN:USA". Present only on datasets whose values
   * were fetched programmatically; its presence is what tells the validator
   * to check the series against its API origin rather than against
   * data/SOURCES.md.
   */
  sourceSeriesId?: string | null;
};
