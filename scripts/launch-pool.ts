/**
 * The launch rotation: a hand-picked pool of charts to serve while the crowd
 * threshold is still out of reach.
 *
 * Run with: npm run rotation -- --apply     (set this pool)
 *           npm run rotation -- --all       (put EVERYTHING back, instantly)
 *           npm run rotation                (show current state, change nothing)
 *
 * WHY A CURATED LIST RATHER THAN "the first 50". The point of a small pool is
 * that every chart in it earns its slot: a player's first five charts decide
 * whether they come back, and a chart nobody holds a wrong belief about
 * collects nothing. So these are picked for the size of the gap between what
 * people assume and what happened, weighted to the US and the world because
 * that is who is being asked.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const POOL = [
  // The two no-account intro charts must be in rotation or the homepage is empty.
  "under-five-mortality-wld", "life-expectancy-wld",

  // United States - the biggest, best-documented misperceptions
  "teen-birth-rate-usa", "male-homicide-rate-usa", "poisoning-death-rate-usa",
  "maternal-mortality-usa", "life-expectancy-usa", "suicide-rate-usa",
  "road-death-rate-usa", "teen-death-rate-usa", "infant-mortality-usa",
  
  // US money and work
  "income-inequality-usa", "top-10-percent-income-share-usa", "unemployment-rate-usa",
  "inflation-usa", "manufacturing-share-usa", "employment-in-agriculture-usa",
  "female-labor-force-participation-usa",
  "government-debt-usa",
  "listed-companies-usa", "bank-branches-usa", "relative-poverty-usa",

  // US energy, climate, land
  "electricity-from-coal-usa", "electricity-from-wind-and-solar-usa",
  "electricity-from-nuclear-usa", "energy-imports-usa", "co2-per-person-usa",
  "air-pollution-usa", "forest-area-usa", "cereal-yield-usa",

  // US society and tech
  "internet-users-usa", "landline-subscriptions-usa", "military-spending-usa",
  "health-spending-share-usa", "out-of-pocket-health-costs-usa",
  "population-over-65-usa", "fertility-rate-usa", "net-migration-usa",

  // The world
  "homicide-rate-wld", "undernourishment-wld", "adult-literacy-wld",
  "electricity-access-wld", "safe-drinking-water-wld", "measles-vaccination-wld",
  "hiv-infection-rate-wld", "co2-emissions-wld", "women-in-parliament-wld",

  // Where the country itself is the surprise
  "life-expectancy-rus", "fertility-rate-kor", "total-population-jpn",
];

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?$/m)![1];
const sql = postgres(url, { prepare: false, ssl: "require" });
const mode = process.argv.includes("--apply") ? "apply"
  : process.argv.includes("--all") ? "all" : "show";

if (mode === "all") {
  const r = await sql`update datasets set in_rotation = true where is_active and not in_rotation returning slug`;
  console.log(`restored ${r.length} charts to rotation - everything active is now being served`);
} else if (mode === "apply") {
  const wanted = [...new Set(POOL)];
  const found = (await sql<{ slug: string }[]>`
    select slug from datasets where slug = any(${wanted}) and is_active`).map(r => r.slug);
  const missing = wanted.filter(s => !found.includes(s));
  if (missing.length) {
    console.error(`\nrefusing to apply - ${missing.length} slug(s) are not active or do not exist:`);
    for (const m of missing) console.error(`  ${m}`);
    console.error("\nFix the list rather than shipping a smaller pool than intended.\n");
    await sql.end();
    process.exit(1);
  }
  await sql.begin(async (tx) => {
    await tx`update datasets set in_rotation = false where is_active`;
    await tx`update datasets set in_rotation = true where slug = any(${found})`;
  });
  console.log(`rotation set to ${found.length} charts`);
} 

const state = await sql`
  select count(*) filter (where is_active and in_rotation)::int as in_rotation,
         count(*) filter (where is_active and not in_rotation)::int as held_back,
         count(*) filter (where is_active)::int as active
  from datasets`;
console.log("\ncurrent:", state[0]);
console.log(`answers needed for the whole rotation to pass the crowd threshold: ${state[0].in_rotation * 50}`);
await sql.end();
