/**
 * Data integrity guard. Runs before every build.
 *
 * The rule this enforces: unverified data must never reach production. A
 * dataset can sit in the repo unverified for as long as it takes a human to
 * check it against the primary source, but the moment it is marked active it
 * has to be real, sourced, and internally consistent.
 *
 * Run with: npm run validate:data
 * Node runs this TypeScript directly via native type stripping. No dependency.
 */

import { allDatasets } from "../lib/datasets/index.ts";
import { readSources } from "../lib/datasets/sources.ts";
import type { Dataset } from "../lib/types/dataset";

type Problem = { slug: string; message: string };

const problems: Problem[] = [];
const warnings: Problem[] = [];

function fail(dataset: Dataset, message: string) {
  problems.push({ slug: dataset.slug, message });
}

function warn(dataset: Dataset, message: string) {
  warnings.push({ slug: dataset.slug, message });
}

const seenSlugs = new Set<string>();

/*
 * Duplicate detection beyond the slug.
 *
 * A slug is only the ADDRESS of a chart; two different addresses can serve
 * the identical question, and that is exactly what shipped once: "Births per
 * woman in Bangladesh" appeared twice in the admin list under the slugs
 * fertility-rate-bgd and fertility-rate-asia-bgd, both plotting
 * SP.DYN.TFRT.IN for BGD, because two catalogue specs listed the same country.
 *
 * Checked here, across curated AND imported datasets together, because the
 * importer's own dedup can only see the batch it is generating - it cannot
 * know that a hand-authored dataset already asks the same question. This is
 * the only place both sets are visible at once.
 */
const seenSeries = new Map<string, string>();
const seenTitles = new Map<string, string>();

/*
 * data/SOURCES.md is the paper trail and the seed script reads provenance from
 * it, so the two must not be allowed to drift. Catching a disagreement here
 * means finding out at build time rather than at seed time.
 */
let sources: ReturnType<typeof readSources>;
try {
  sources = readSources();
} catch (error) {
  console.error(`\nvalidate-datasets: cannot read data/SOURCES.md\n  ${error}\n`);
  process.exit(1);
}

for (const dataset of allDatasets) {
  // --- structural checks, applied to every dataset ------------------------

  if (!dataset.slug || !/^[a-z0-9-]+$/.test(dataset.slug)) {
    fail(dataset, `slug is missing or not url-safe: ${JSON.stringify(dataset.slug)}`);
  }

  if (seenSlugs.has(dataset.slug)) {
    fail(dataset, "duplicate slug");
  }
  seenSlugs.add(dataset.slug);

  if (dataset.sourceSeriesId) {
    const owner = seenSeries.get(dataset.sourceSeriesId);
    if (owner) {
      fail(
        dataset,
        `duplicate series ${dataset.sourceSeriesId} - already served by "${owner}". ` +
          `Two charts must never plot the same indicator for the same country.`,
      );
    } else {
      seenSeries.set(dataset.sourceSeriesId, dataset.slug);
    }
  }

  const titleOwner = seenTitles.get(dataset.title);
  if (titleOwner) {
    fail(
      dataset,
      `duplicate title "${dataset.title}" - already used by "${titleOwner}"`,
    );
  } else {
    seenTitles.set(dataset.title, dataset.slug);
  }

  if (dataset.xValues.length !== dataset.yValues.length) {
    fail(
      dataset,
      `x/y length mismatch: ${dataset.xValues.length} x values, ${dataset.yValues.length} y values`,
    );
  }

  if (dataset.xValues.length < 4) {
    fail(dataset, `series too short: ${dataset.xValues.length} points`);
  }

  if (
    !Number.isInteger(dataset.revealFromIndex) ||
    dataset.revealFromIndex < 1 ||
    dataset.revealFromIndex > dataset.yValues.length - 2
  ) {
    fail(
      dataset,
      `revealFromIndex ${dataset.revealFromIndex} leaves nothing to draw (series length ${dataset.yValues.length})`,
    );
  }

  if (dataset.yValues.some((value) => !Number.isFinite(value))) {
    fail(dataset, "yValues contains a non-finite number");
  }

  const [domainMin, domainMax] = dataset.yDomain;
  if (!(domainMax > domainMin)) {
    fail(dataset, `yDomain is not ascending: [${domainMin}, ${domainMax}]`);
  }

  const outOfDomain = dataset.yValues.filter(
    (value) => value < domainMin || value > domainMax,
  );
  if (outOfDomain.length > 0) {
    fail(
      dataset,
      `${outOfDomain.length} value(s) fall outside yDomain [${domainMin}, ${domainMax}]`,
    );
  }

  if (dataset.verified && !dataset.verifiedOn) {
    fail(dataset, "verified is true but verifiedOn is null");
  }

  if (!dataset.verified && dataset.verifiedOn) {
    fail(dataset, "verifiedOn is set but verified is false");
  }

  // --- reliability --------------------------------------------------------
  //
  // Every dataset carries a rating, and the rules differ by level because the
  // levels assert genuinely different things.

  if (!["green", "yellow", "red"].includes(dataset.reliability)) {
    fail(dataset, `reliability is missing or not a known level: ${dataset.reliability}`);
  }

  // A colour with no explanation cannot be reviewed or argued with later -
  // the same reason guesses.suspect_reasons has always accompanied
  // is_suspect. Green needs no note: "the source's own numbers" IS the note.
  if (dataset.reliability !== "green" && !dataset.reliabilityNote) {
    fail(dataset, `reliability is ${dataset.reliability} but no reliabilityNote explains why`);
  }

  // Green is a claim about REPRODUCIBILITY, so it has to be checkable. A
  // green dataset with no machine-readable series id is asserting something
  // nobody else can verify, which is exactly what the rating is meant to
  // rule out.
  if (dataset.reliability === "green" && !dataset.sourceSeriesId) {
    fail(
      dataset,
      "rated green but has no sourceSeriesId. Green means the values can be " +
        "re-fetched and compared; without an id that claim cannot be checked.",
    );
  }

  // The standing instruction (2026-08-27): never import red. Red exists only
  // to describe charts that predate the rating system honestly.
  if (dataset.reliability === "red" && dataset.sourceSeriesId) {
    fail(
      dataset,
      "an imported dataset is rated red. Imports must be green or yellow - " +
        "if the data cannot clear that bar it should not be imported at all.",
    );
  }

  // --- provenance ---------------------------------------------------------
  //
  // Two mechanisms, checked differently rather than forced through one rule.
  // A hand-authored dataset's paper trail is a reviewed row in
  // data/SOURCES.md. An imported one's is an API endpoint: sourceSeriesId
  // records the exact indicator and country, so anyone can re-run the fetch.
  // Demanding a SOURCES.md row for 331 machine-imported series would mean
  // generating a paper trail nobody wrote and nobody read, which is worse
  // than no paper trail because it looks like one.

  if (dataset.sourceSeriesId) {
    if (!/^[a-z]+:[A-Za-z0-9._-]+:[A-Z]{3}$/.test(dataset.sourceSeriesId)) {
      fail(
        dataset,
        `sourceSeriesId is not in the expected provider:indicator:country form: ${dataset.sourceSeriesId}`,
      );
    }
    if (!dataset.sourceUrl.startsWith("https://")) {
      fail(dataset, "imported dataset has no https source URL");
    }
    // Skip the SOURCES.md cross-check entirely for imported series.
    continue;
  }

  const source = sources.get(dataset.slug);

  if (!source) {
    fail(dataset, "has no row in data/SOURCES.md. Every dataset needs a paper trail.");
  } else {
    if (source.verified !== dataset.verified) {
      fail(
        dataset,
        `SOURCES.md says verified=${source.verified} but the module says ` +
          `verified=${dataset.verified}`,
      );
    }

    if (source.verifiedOn !== dataset.verifiedOn) {
      fail(
        dataset,
        `SOURCES.md says verifiedOn=${source.verifiedOn} but the module says ` +
          `verifiedOn=${dataset.verifiedOn}`,
      );
    }

    if (source.sourceUrl && source.sourceUrl !== dataset.sourceUrl) {
      fail(
        dataset,
        `source URL differs. SOURCES.md: ${source.sourceUrl} / module: ${dataset.sourceUrl}`,
      );
    }
  }

  // --- the production gate ------------------------------------------------

  if (dataset.isActive) {
    if (!dataset.verified) {
      fail(dataset, "is active but not verified");
    }
    if (!dataset.sourceUrl || !/^https?:\/\//.test(dataset.sourceUrl)) {
      fail(dataset, `is active but sourceUrl is missing or not a url: ${dataset.sourceUrl}`);
    }
    if (!dataset.sourceName.trim()) {
      fail(dataset, "is active but sourceName is empty");
    }
    if (!dataset.question.trim() || !dataset.title.trim()) {
      fail(dataset, "is active but title or question is empty");
    }
  } else {
    warn(dataset, "inactive - will not be served to players");
  }
}

// --- report ---------------------------------------------------------------

const count = allDatasets.length;

for (const { slug, message } of warnings) {
  console.warn(`  warn  ${slug}: ${message}`);
}

if (problems.length > 0) {
  console.error(
    `\nvalidate-datasets: ${problems.length} problem(s) across ${count} dataset(s)\n`,
  );
  for (const { slug, message } of problems) {
    console.error(`  FAIL  ${slug}: ${message}`);
  }
  console.error("");
  process.exit(1);
}

console.log(`validate-datasets: ${count} dataset(s) ok`);
