/**
 * Push the datasets in lib/datasets into the database.
 *
 * Nothing is retyped into SQL. The numbers come from the TypeScript module the
 * build gate already validates; the provenance comes from data/SOURCES.md, the
 * document a human actually reviews. If those two disagree, this refuses to
 * run - a disagreement means one of them is wrong, and guessing which would be
 * how bad provenance gets laundered into a database and then into a finding.
 *
 * Run with: npm run seed
 */

import postgres from "postgres";
import { allDatasets } from "../lib/datasets/index.ts";
import { readSources } from "../lib/datasets/sources.ts";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error(
    "\nDATABASE_URL is not set.\n\n" +
      "  Supabase > Project Settings > Database > Connection string\n" +
      "  Use the DIRECT connection (port 5432) for seeding, not the pooler.\n",
  );
  process.exit(1);
}

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const sources = readSources();
const problems: string[] = [];

for (const dataset of allDatasets) {
  const source = sources.get(dataset.slug);

  // Imported series are exempt: their provenance is sourceSeriesId, checked
  // by scripts/validate-datasets.ts, not a hand-written SOURCES.md row.
  if (dataset.sourceSeriesId) continue;

  if (!source) {
    problems.push(
      `${dataset.slug}: no row in data/SOURCES.md. Every dataset needs a paper trail.`,
    );
    continue;
  }

  if (source.verified !== dataset.verified) {
    problems.push(
      `${dataset.slug}: SOURCES.md says verified=${source.verified}, ` +
        `the dataset says verified=${dataset.verified}. Resolve before seeding.`,
    );
  }

  if (source.sourceUrl && source.sourceUrl !== dataset.sourceUrl) {
    problems.push(
      `${dataset.slug}: source URL differs.\n` +
        `      SOURCES.md: ${source.sourceUrl}\n` +
        `      dataset:    ${dataset.sourceUrl}`,
    );
  }

  if (dataset.xValues.length !== dataset.yValues.length) {
    problems.push(`${dataset.slug}: x/y length mismatch.`);
  }
}

if (problems.length > 0) {
  console.error(`\nseed-datasets: refusing to seed\n`);
  for (const problem of problems) console.error(`  FAIL  ${problem}`);
  console.error("");
  await sql.end();
  process.exit(1);
}

let inserted = 0;
let updated = 0;

for (const dataset of allDatasets) {
  /*
   * Imported series have no SOURCES.md row and are not supposed to - their
   * paper trail is sourceSeriesId, which anyone can re-fetch. Their
   * methodology note is generated from that rather than looked up.
   */
  const source = sources.get(dataset.slug);
  const methodologyNote = source
    ? source.methodologyNote
    : `Imported programmatically. Series: ${dataset.sourceSeriesId}. ` +
      `Values are the source's own published observations for each year, ` +
      `rounded but never interpolated or smoothed. Re-run npm run import:wb ` +
      `to reproduce them.`;

  const rows = await sql<{ slug: string; was_insert: boolean }[]>`
    insert into datasets (
      slug, title, question, y_label, y_unit,
      x_values, y_values, reveal_from_index,
      y_domain_min, y_domain_max,
      source_name, source_url, methodology_note,
      is_active, verified, verified_on, published_at,
      reliability, reliability_note, source_series_id, source_fetched_at
    ) values (
      ${dataset.slug},
      ${dataset.title},
      ${dataset.question},
      ${dataset.yLabel},
      ${dataset.yUnit},
      ${sql.json(dataset.xValues)},
      ${sql.json(dataset.yValues)},
      ${dataset.revealFromIndex},
      ${dataset.yDomain[0]},
      ${dataset.yDomain[1]},
      ${dataset.sourceName},
      ${dataset.sourceUrl},
      ${methodologyNote},
      ${dataset.isActive},
      ${dataset.verified},
      ${dataset.verifiedOn},
      ${dataset.isActive ? new Date() : null},
      ${dataset.reliability},
      ${dataset.reliabilityNote ?? null},
      ${dataset.sourceSeriesId ?? null},
      ${dataset.sourceSeriesId ? new Date() : null}
    )
    on conflict (slug) do update set
      title             = excluded.title,
      question          = excluded.question,
      y_label           = excluded.y_label,
      y_unit            = excluded.y_unit,
      x_values          = excluded.x_values,
      y_values          = excluded.y_values,
      reveal_from_index = excluded.reveal_from_index,
      y_domain_min      = excluded.y_domain_min,
      y_domain_max      = excluded.y_domain_max,
      source_name       = excluded.source_name,
      source_url        = excluded.source_url,
      methodology_note  = excluded.methodology_note,
      is_active         = excluded.is_active,
      verified          = excluded.verified,
      verified_on       = excluded.verified_on,
      reliability       = excluded.reliability,
      reliability_note  = excluded.reliability_note,
      source_series_id  = excluded.source_series_id,
      source_fetched_at = excluded.source_fetched_at
    returning slug, (xmax = 0) as was_insert
  `;

  const row = rows[0];
  if (row.was_insert) inserted += 1;
  else updated += 1;

  console.log(
    `  ${row.was_insert ? "insert" : "update"}  ${dataset.slug}` +
      `  (${dataset.yValues.length} points, ` +
      `verified=${dataset.verified}, active=${dataset.isActive})`,
  );
}

console.log(
  `\nseed-datasets: ${inserted} inserted, ${updated} updated, ` +
    `${allDatasets.length} total\n`,
);

/*
 * Retire imported datasets that the catalogue no longer produces.
 *
 * The upsert above can create and update but never withdraw, so before this
 * existed a slug dropped from wb-catalogue.ts stayed live in the database
 * forever. That went unnoticed until the 2026-08-27 catalogue rewrite, which
 * replaced 331 near-duplicate country charts with a different set entirely -
 * without this step, every one of the 331 would have remained active and
 * playable alongside their replacements.
 *
 * DEACTIVATED, NEVER DELETED. A retired dataset may already have real guesses
 * attached, and those guesses are the entire research output of this project.
 * Deleting the row would either destroy them or fail on the foreign key.
 * Setting is_active = false takes the chart out of circulation while leaving
 * every answer ever given to it intact and still queryable in the admin view.
 *
 * Scoped to source_series_id is not null, so this only ever touches rows the
 * importer itself created. Hand-authored datasets are not the importer's to
 * retire, and their own is_active state is a human's decision.
 */
const liveSlugs = allDatasets.map((d) => d.slug);

/*
 * Clear the mark first, so re-adding an indicator to the catalogue brings its
 * chart back to a normal pending state rather than leaving it permanently
 * unactivatable. Ordered before the retirement below so a slug that left and
 * returned in the same edit is handled correctly.
 */
await sql`
  update datasets set retired_at = null, retired_reason = null
  where retired_at is not null
    and retired_reason = 'catalogue'
    and slug = any(${liveSlugs})
`;

const retired = await sql<{ slug: string }[]>`
  update datasets
  set is_active = false,
      /*
       * retired_at is what stops activateGreenDatasets() turning these back
       * on. is_active = false alone cannot say WHY the chart is off, and the
       * bulk action reads it as "not yet reviewed" - which put 289 withdrawn
       * charts back into circulation the first time this ran.
       */
      retired_at = coalesce(retired_at, now()),
      retired_reason = coalesce(retired_reason, 'catalogue')
  where source_series_id is not null
    and slug <> all(${liveSlugs})
    and (is_active = true or retired_at is null)
  returning slug
`;

if (retired.length > 0) {
  console.log(
    `seed-datasets: retired ${retired.length} imported dataset(s) no longer ` +
      `in the catalogue (deactivated, not deleted - any guesses they ` +
      `collected are preserved)\n`,
  );
}

await sql.end();
