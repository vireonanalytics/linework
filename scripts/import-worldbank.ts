/**
 * Import exact annual series from the World Bank API into a dataset bundle.
 *
 * Run with: npm run import:wb
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AND WHAT MAKES ITS OUTPUT "GREEN"
 * ---------------------------------------------------------------------------
 * The 21 datasets that predate this script are piecewise-linear
 * interpolations between a handful of hand-typed anchor points. That is why
 * every one of them is rated red: the numbers between the anchors were
 * invented by a straight line, not measured by anybody.
 *
 * Everything this script writes is different in kind, not degree. Each value
 * is the World Bank's own published observation for that country-year,
 * fetched over the API and rounded (never smoothed, never interpolated,
 * never extrapolated). The indicator code is stored alongside, so anyone can
 * re-run the same request and get the same numbers back. That reproducibility
 * is what a green rating actually asserts - not "I am confident", but "here
 * is how to check me".
 *
 * ---------------------------------------------------------------------------
 * THE QUALITY GATES, AND WHY EACH ONE REJECTS RATHER THAN PATCHES
 * ---------------------------------------------------------------------------
 * A rejected series costs nothing; a bad one poisons a research dataset. So
 * every gate below drops the series instead of trying to repair it:
 *
 *  - fewer than MIN_POINTS observations: too short to draw a trend on.
 *  - any interior gap: the World Bank leaves genuine holes, and filling one
 *    would recreate the exact interpolation problem that made the old
 *    datasets red. Leading and trailing nulls are trimmed (that is just a
 *    shorter series); a hole in the MIDDLE disqualifies it.
 *  - a flat series: nothing to guess, so it collects no misperception.
 *  - a series whose drawable portion barely moves: same problem, less obvious.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { CATALOGUE, type IndicatorSpec } from "./wb-catalogue.ts";

const API = "https://api.worldbank.org/v2";

/** Below this many annual observations there is not enough shape to draw. */
const MIN_POINTS = 18;

/** Reveal this much of the series; the player draws the rest. */
const REVEAL_FRACTION = 0.58;

/**
 * The drawable portion must vary by at least this share of the full series
 * range, or there is nothing to be wrong about.
 */
const MIN_DRAWABLE_VARIATION = 0.08;

type Observation = { date: string; value: number | null };

type ImportedDataset = {
  slug: string;
  title: string;
  question: string;
  yLabel: string;
  yUnit: string;
  xValues: string[];
  yValues: number[];
  revealFromIndex: number;
  yDomain: [number, number];
  sourceName: string;
  sourceUrl: string;
  verified: boolean;
  isActive: boolean;
  reliability: "green" | "yellow";
  reliabilityNote: string | null;
  sourceSeriesId: string;
  sourceFetchedAt: string;
};

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      // The API rate-limits under bursts; back off rather than hammering it.
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

/** Indicator metadata, cached - one request per indicator, not per country. */
const metaCache = new Map<string, { name: string; org: string }>();

async function indicatorMeta(code: string) {
  const cached = metaCache.get(code);
  if (cached) return cached;

  const body = (await getJson(`${API}/indicator/${code}?format=json`)) as unknown[];
  const row = (body[1] as Record<string, unknown>[] | undefined)?.[0];
  const meta = {
    name: (row?.name as string) ?? code,
    /*
     * The World Bank is usually a redistributor. Recording the ORIGINATING
     * organisation means a chart sourced from UN Population Division or
     * WHO/UNICEF says so, rather than everything being credited to the
     * World Bank.
     */
    org: ((row?.sourceOrganization as string) ?? "").split(",")[0].trim(),
  };
  metaCache.set(code, meta);
  return meta;
}

const countryCache = new Map<string, string>();

/**
 * The API's own names do not all read as English prose. It calls the world
 * aggregate "World", which produces "Life expectancy at birth in World", and
 * "United States", which produces "in United States". Every title and
 * question in the catalogue puts {country} after a preposition, so the
 * article belongs in the name.
 *
 * Only names that are actually WRONG in that position are listed. Everything
 * else ("Japan", "Brazil") is already correct and is left to the API, so this
 * map does not quietly become a second, stale copy of the country list.
 */
const NAME_OVERRIDES: Record<string, string> = {
  WLD: "the world",
  USA: "the United States",
  // The API's formal register, which reads as bureaucratic in a game prompt.
  RUS: "Russia",
  KOR: "South Korea",
};

async function countryName(iso3: string): Promise<string> {
  const override = NAME_OVERRIDES[iso3];
  if (override) return override;

  const cached = countryCache.get(iso3);
  if (cached) return cached;

  const body = (await getJson(`${API}/country/${iso3}?format=json`)) as unknown[];
  const row = (body[1] as Record<string, unknown>[] | undefined)?.[0];
  const name = (row?.name as string) ?? iso3;
  countryCache.set(iso3, name);
  return name;
}

async function fetchSeries(code: string, iso3: string): Promise<Observation[]> {
  const body = (await getJson(
    `${API}/country/${iso3}/indicator/${code}?format=json&per_page=400`,
  )) as unknown[];
  const rows = (body[1] as Record<string, unknown>[] | undefined) ?? [];
  return rows
    .map((r) => ({ date: String(r.date), value: r.value as number | null }))
    .sort((a, b) => Number(a.date) - Number(b.date));
}

type Prepared = { years: string[]; values: number[] } | { reject: string };

function prepare(raw: Observation[], spec: IndicatorSpec): Prepared {
  const filtered = spec.minYear
    ? raw.filter((o) => Number(o.date) >= spec.minYear!)
    : raw;

  // Trim leading and trailing nulls - a shorter series is still honest.
  let start = 0;
  let end = filtered.length - 1;
  while (start <= end && filtered[start].value === null) start += 1;
  while (end >= start && filtered[end].value === null) end -= 1;
  const trimmed = filtered.slice(start, end + 1);

  if (trimmed.length < MIN_POINTS) {
    return { reject: `only ${trimmed.length} points` };
  }

  // An interior null is a real hole. Filling it would be interpolation, which
  // is exactly what makes a dataset red - so the series is dropped instead.
  const holes = trimmed.filter((o) => o.value === null).length;
  if (holes > 0) return { reject: `${holes} interior gap(s)` };

  const decimals = spec.decimals ?? 1;
  const values = trimmed.map(
    (o) => Number((o.value as number).toFixed(decimals)),
  );
  const years = trimmed.map((o) => o.date);

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return { reject: "series is flat" };

  const revealFromIndex = Math.max(
    2,
    Math.min(values.length - 4, Math.floor(values.length * REVEAL_FRACTION)),
  );

  // The part the player actually draws has to go somewhere.
  const drawable = values.slice(revealFromIndex);
  const drawableRange = Math.max(...drawable) - Math.min(...drawable);
  if (drawableRange / (max - min) < MIN_DRAWABLE_VARIATION) {
    return { reject: "drawable portion barely moves" };
  }

  return { years, values };
}

/** A padded, rounded axis domain. Anchored at zero when the data is close to it. */
function axisDomain(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const low = min >= 0 && min <= span * 0.6 ? 0 : min - span * 0.15;
  const high = max + span * 0.15;

  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, high))) - 1);
  return [
    Math.floor(low / magnitude) * magnitude,
    Math.ceil(high / magnitude) * magnitude,
  ];
}

async function main() {
  const out: ImportedDataset[] = [];
  const rejected: string[] = [];
  const fetchedAt = new Date().toISOString();

  /*
   * DEDUPLICATION KEYS, AND THE BUG THAT PROVED ONE WAS NOT ENOUGH.
   *
   * This used to dedupe on slug alone, which is the wrong key. The 2026-08-27
   * catalogue rewrite was prompted partly by a chart that appeared in the
   * admin list TWICE, identical in every visible respect: "Births per woman
   * in Bangladesh", both reading worldbank:SP.DYN.TFRT.IN:BGD.
   *
   * The old catalogue had two specs for the same indicator - `fertility-rate`
   * (whose country list contained BGD) and `fertility-rate-asia` (which also
   * contained BGD). Their slug STEMS differed, so the slugs differed, so the
   * slug check passed happily while emitting the same series under two names.
   * A player could be served the identical question twice, and the two rows
   * would split that dataset's guesses across two aggregates.
   *
   * The identity of a chart is the SERIES it shows, so that is the primary
   * key now. Title is checked too, because two different indicators phrased
   * into the same sentence are just as duplicated from a player's point of
   * view even though the underlying series differ.
   */
  const seenSlugs = new Set<string>();
  const seenSeries = new Map<string, string>();
  const seenTitles = new Map<string, string>();

  const total = CATALOGUE.reduce((n, s) => n + s.countries.length, 0);
  let done = 0;

  for (const spec of CATALOGUE) {
    const meta = await indicatorMeta(spec.code);

    for (const iso3 of spec.countries) {
      done += 1;

      /*
       * Checked BEFORE the network call, not after. A duplicate spec should
       * cost nothing, and finding out after fetching means the catalogue can
       * quietly grow slow duplicates that only surface as wasted requests.
       */
      const seriesId = `worldbank:${spec.code}:${iso3}`;
      const firstSeen = seenSeries.get(seriesId);
      if (firstSeen) {
        rejected.push(
          `${spec.code}/${iso3}: duplicate series, already imported as "${firstSeen}"`,
        );
        continue;
      }

      let series: Observation[];
      try {
        series = await fetchSeries(spec.code, iso3);
      } catch (error) {
        rejected.push(`${spec.code}/${iso3}: fetch failed (${String(error)})`);
        continue;
      }

      const prepared = prepare(series, spec);
      if ("reject" in prepared) {
        rejected.push(`${spec.code}/${iso3}: ${prepared.reject}`);
        continue;
      }

      const name = await countryName(iso3);
      const slug = `${spec.slug}-${iso3.toLowerCase()}`;
      if (seenSlugs.has(slug)) {
        rejected.push(`${slug}: duplicate slug`);
        continue;
      }

      const title = spec.title.replace("{country}", name);
      const titleOwner = seenTitles.get(title);
      if (titleOwner) {
        rejected.push(
          `${slug}: duplicate title "${title}", already used by ${titleOwner}`,
        );
        continue;
      }

      seenSlugs.add(slug);
      seenSeries.set(seriesId, slug);
      seenTitles.set(title, slug);

      const { years, values } = prepared;
      const revealFromIndex = Math.max(
        2,
        Math.min(values.length - 4, Math.floor(values.length * REVEAL_FRACTION)),
      );

      out.push({
        slug,
        title,
        question: spec.question
          .replace("{country}", name)
          .replace("{year}", years[revealFromIndex]),
        yLabel: spec.yLabel,
        yUnit: spec.yUnit,
        xValues: years,
        yValues: values,
        revealFromIndex,
        yDomain: axisDomain(values),
        sourceName: meta.org
          ? `${meta.org} (via World Bank WDI)`
          : "World Bank, World Development Indicators",
        sourceUrl: `https://data.worldbank.org/indicator/${spec.code}?locations=${iso3}`,
        /*
         * verified stays FALSE. "Verified" in this project has always meant
         * a human checked it, and no human has looked at these yet - the
         * reliability rating is a separate axis describing where the numbers
         * came from. Conflating the two would let an automated import mark
         * itself human-approved.
         */
        verified: false,
        isActive: false,
        reliability: "green",
        reliabilityNote: null,
        sourceSeriesId: `worldbank:${spec.code}:${iso3}`,
        sourceFetchedAt: fetchedAt,
      });

      if (done % 25 === 0) {
        console.log(`  ...${done}/${total} attempted, ${out.length} kept`);
      }
    }
  }

  mkdirSync("lib/datasets/generated", { recursive: true });
  writeFileSync(
    "lib/datasets/generated/worldbank.json",
    JSON.stringify(out, null, 1),
  );

  console.log(`\nimport-worldbank: kept ${out.length} of ${total} attempted`);
  console.log(`import-worldbank: rejected ${rejected.length}`);
  for (const line of rejected.slice(0, 25)) console.log(`  drop  ${line}`);
  if (rejected.length > 25) console.log(`  ...and ${rejected.length - 25} more`);
}

await main();
