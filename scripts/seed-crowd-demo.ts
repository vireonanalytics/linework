/**
 * ============================================================================
 * DEV/DEMO ONLY. Inserts fabricated guesses directly into the live database.
 * ============================================================================
 *
 * This exists for exactly one reason: to put enough rows in `guesses` to
 * demonstrate the Phase 4 crowd view - percentile bands, the ink-density
 * sample, "you vs everyone" - before real players exist to generate that data
 * themselves.
 *
 * It reuses lib/crowd/synthetic.ts, the same generator the Phase 2 design
 * preview uses, so the shape of the fake crowd is the same one already
 * reviewed: mostly undershooting a falling series, biased but not uniform
 * noise. That bias is a guess about human behaviour, not a measurement of it -
 * see the warning in that file. It is not more true here for being in a
 * database instead of a browser.
 *
 * Every row this script writes is deletable by rerunning with --clean, and it
 * writes NOTHING that a real request wouldn't also produce structurally - the
 * insert goes through the same scoreGuess/assessGuess logic as
 * POST /api/guess, just without an HTTP round trip, so the seeded rows are
 * self-consistent (score matches path, suspect flags are real).
 *
 * Never wired into build, deploy, or any other script. Run by hand:
 *
 *   npm run seed:crowd-demo -- --slug us-teen-birth-rate --count 120
 *   npm run seed:crowd-demo -- --clean
 */

import postgres from "postgres";
import { PATH_POINTS, quantize } from "../lib/drawing/resample.ts";
import { scoreGuess, truthPathNormalized } from "../lib/scoring/score.ts";
import { syntheticCrowd } from "../lib/crowd/synthetic.ts";
import { assessGuess, deviceTypeFrom } from "../lib/server/suspect.ts";
import { allDatasets } from "../lib/datasets/index.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const clean = args.includes("--clean");
const slug = flag("slug") ?? "us-teen-birth-rate";
const count = Number(flag("count") ?? "120");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const datasetRow = allDatasets.find((d) => d.slug === slug);
if (!datasetRow) {
  console.error(`No dataset "${slug}" in lib/datasets/index.ts.`);
  await sql.end();
  process.exit(1);
}

const datasetIdRows = await sql<{ id: number }[]>`
  select id from datasets where slug = ${slug}
`;
const datasetId: number | null = datasetIdRows[0]?.id ?? null;

if (!datasetId) {
  console.error(
    `"${slug}" has no row in the datasets table yet. Run "npm run seed" first.`,
  );
  await sql.end();
  process.exit(1);
}

if (clean) {
  const deleted = await sql<{ id: number }[]>`
    delete from guesses
    where dataset_id = ${datasetId}
      and session_id in (select id from sessions where country = 'ZZ')
    returning id
  `;
  await sql`
    delete from sessions
    where country = 'ZZ'
      and id not in (select session_id from guesses)
  `;
  console.log(`seed-crowd-demo: removed ${deleted.length} demo guess(es) for ${slug}`);
  await sql.end();
  process.exit(0);
}

const truth = truthPathNormalized(datasetRow, PATH_POINTS);

// 'ZZ' is not a real ISO-3166 country code - it is the tag this script uses to
// find its own rows again on --clean. Real sessions never get this value.
const DEMO_COUNTRY = "ZZ";

console.log(`seed-crowd-demo: generating ${count} guesses for ${slug}...`);

const paths = syntheticCrowd({ truth, count });
let inserted = 0;

for (const unitPath of paths) {
  const path = quantize(unitPath);
  const scored = scoreGuess(unitPath, truth);

  // Plausible, varied draw behaviour - not all instant, not all identical.
  const drawMs = 800 + Math.round(Math.random() * 6000);
  const redrawCount = Math.random() < 0.15 ? 1 : 0;
  const viewportWidth = [360, 390, 414, 768, 1280, 1440][
    Math.floor(Math.random() * 6)
  ];
  const userAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

  const assessment = assessGuess({
    path,
    drawMs,
    isDuplicate: false,
    userAgent,
  });

  const sessionId = crypto.randomUUID();

  await sql.begin(async (tx) => {
    await tx`
      insert into sessions (id, country, device_type, referrer_host, ua_hash)
      values (${sessionId}, ${DEMO_COUNTRY}, ${deviceTypeFrom(userAgent)}, null, 'demo-seed')
    `;

    await tx`
      insert into guesses (
        session_id, dataset_id, path, path_resolution, order_in_session,
        draw_ms, redraw_count, viewport_w,
        score, mean_abs_error, mean_signed_error,
        is_suspect, suspect_reasons
      ) values (
        ${sessionId}, ${datasetId}, ${path}::smallint[], ${PATH_POINTS}, 1,
        ${drawMs}, ${redrawCount}, ${viewportWidth},
        ${scored.score}, ${scored.meanAbsError}, ${scored.meanSignedError},
        ${assessment.isSuspect}, ${assessment.reasons}::text[]
      )
    `;
  });

  inserted += 1;
}

console.log(`seed-crowd-demo: inserted ${inserted} guess(es)`);
console.log("seed-crowd-demo: running recompute_crowd_stats()...");
await sql`select recompute_crowd_stats()`;

const [stats] = await sql<{ n: number }[]>`
  select n from crowd_stats where dataset_id = ${datasetId} limit 1
`;
console.log(
  stats
    ? `seed-crowd-demo: crowd_stats now reports n=${stats.n} unflagged guesses for ${slug}`
    : `seed-crowd-demo: crowd_stats has no row for ${slug} - check the cold-start threshold`,
);

console.log(`\nTo remove this demo data: npm run seed:crowd-demo -- --clean\n`);

await sql.end();
