/**
 * ============================================================================
 * DEV/DEMO ONLY. Inserts fabricated accounts and guesses directly into the
 * live database.
 * ============================================================================
 *
 * Exists for exactly one reason: so the admin dashboard - specifically the
 * per-dataset analysis page and its 2026-08-26 state/city/age filters - has
 * something real to look at before enough genuine signed-in players exist to
 * populate it on their own. Every account gets a display name, a real
 * city/state from lib/geo/us-places.json, and a birth year, so the filters
 * actually have variety to filter across.
 *
 * Each demo account is a real row in `users` (real password hash, so it
 * could even be signed into if anyone wanted to) that answers a handful of
 * real ACTIVE datasets, scored and inserted through the exact same
 * scoreGuess/assessGuess/recordGuess path a live request uses - the pattern
 * scripts/seed-crowd-demo.ts established first for guesses; this script
 * extends it to also create the users those guesses belong to.
 *
 * The demographic profile (city, state, birth year) is assigned completely
 * independently of the guess itself - which dataset, how accurate. That is
 * deliberate: if age or state correlated with guess quality here, it would
 * be trivial to mistake a scripted coincidence for a real finding later.
 * Nothing about who these guesses "belong to" means anything - it exists
 * purely to give the new admin filters something to filter.
 *
 * Reuses lib/crowd/synthetic.ts for guess SHAPE, same as seed-crowd-demo.ts,
 * so the bias is the one already reviewed for the design preview, not a new
 * invention (see that file's own warning: a guess about human behaviour, not
 * a measurement of it).
 *
 * Deliberately keeps each dataset's guess count well under CROWD_MIN_N (50,
 * see lib/crowd/constants.ts) - pg_cron recomputes crowd_stats on its own
 * schedule regardless of anything this script does, so there is no way to
 * keep this data out of that table entirely, but staying under the
 * threshold keeps `belowThreshold` true and stops the fake data from ever
 * being shown to a real player as a percentile band or ink-density sample.
 *
 * Tagged by email (demo-*@drawtheline.demo) so --clean can find and remove
 * every account, session, and guess this script created, and nothing else.
 *
 * Never wired into build, deploy, or any other script. Run by hand:
 *
 *   npm run seed:demo-players
 *   npm run seed:demo-players -- --accounts 30 --per-account 6
 *   npm run seed:demo-players -- --clean
 */

import postgres from "postgres";
import placesJson from "../lib/geo/us-places.json" with { type: "json" };
import { PATH_POINTS, quantize } from "../lib/drawing/resample.ts";
import { scoreGuess, truthPathNormalized } from "../lib/scoring/score.ts";
import { syntheticCrowd } from "../lib/crowd/synthetic.ts";
import { assessGuess, deviceTypeFrom } from "../lib/server/suspect.ts";
import { hashUserAgent } from "../lib/server/hash.ts";
import { hashPassword } from "../lib/server/password.ts";
import { allDatasets } from "../lib/datasets/index.ts";
import { recordGuess, maybeAdvanceStreak } from "../lib/server/db.ts";

type Place = { city: string; state: string };
const PLACES = placesJson as Place[];

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const clean = args.includes("--clean");
const accountCount = Number(flag("accounts") ?? "30");
const perAccount = Number(flag("per-account") ?? "6");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

// Not a real TLD - chosen so it can never collide with a real signup, the
// same reason seed-crowd-demo.ts tags sessions with country 'ZZ'.
const EMAIL_DOMAIN = "drawtheline.demo";
const DEMO_PASSWORD = "Demo-Player-2026!";

if (clean) {
  const demoUsers = await sql<{ id: string }[]>`
    select id from users where email like ${"demo-%@" + EMAIL_DOMAIN}
  `;
  const ids = demoUsers.map((r) => r.id);

  if (ids.length === 0) {
    console.log("seed-demo-players: no demo accounts found, nothing to clean.");
    await sql.end();
    process.exit(0);
  }

  const sessionRows = await sql<{ session_id: string }[]>`
    select distinct session_id from guesses where user_id in ${sql(ids)}
  `;
  const sessionIds = sessionRows.map((r) => r.session_id);

  const deletedGuesses = await sql<{ id: number }[]>`
    delete from guesses where user_id in ${sql(ids)} returning id
  `;
  if (sessionIds.length > 0) {
    await sql`delete from sessions where id in ${sql(sessionIds)}`;
  }
  const deletedUsers = await sql<{ id: string }[]>`
    delete from users where id in ${sql(ids)} returning id
  `;

  console.log(
    `seed-demo-players: removed ${deletedGuesses.length} guess(es), ` +
      `${sessionIds.length} session(s), ${deletedUsers.length} account(s)`,
  );
  await sql.end();
  process.exit(0);
}

const activeRows = await sql<{ id: number; slug: string }[]>`
  select id, slug from datasets where is_active = true order by id
`;

if (activeRows.length === 0) {
  console.error(
    "seed-demo-players: no active datasets in the database - nothing to " +
      "generate guesses for. (Reads is_active from the database, not the " +
      "isActive literal in lib/datasets/*.ts - those two can disagree.)",
  );
  await sql.end();
  process.exit(1);
}

const activeDatasets = activeRows
  .map((row) => ({ id: row.id, dataset: allDatasets.find((d) => d.slug === row.slug) }))
  .filter((r): r is { id: number; dataset: NonNullable<(typeof r)["dataset"]> } => r.dataset !== undefined);

const FIRST_NAMES = [
  "Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Jennifer",
  "David", "Barbara", "William", "Elizabeth", "Richard", "Jessica", "Joseph",
  "Sarah", "Thomas", "Karen", "Charles", "Nancy", "Daniel", "Lisa",
  "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald",
  "Ashley", "Steven", "Priya", "Wei", "Carlos", "Fatima", "Kenji",
];
const LAST_INITIALS = "ABCDEFGHJKLMNPRSTVW".split("");

const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
];
const VIEWPORT_WIDTHS = [360, 390, 414, 768, 1280, 1440];

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

type Persona = {
  email: string;
  displayName: string;
  city: string;
  state: string;
  birthYear: number;
};

function makePersonas(count: number): Persona[] {
  const places = shuffled(PLACES);
  const personas: Persona[] = [];

  for (let i = 0; i < count; i += 1) {
    const place = places[i % places.length];
    const first = pick(FIRST_NAMES);
    const lastInitial = pick(LAST_INITIALS);
    // 1955-2005: ages roughly 21-71 as of 2026, well inside the
    // users_birth_year_is_plausible constraint (1900..currentYear-5).
    const birthYear = 1955 + Math.floor(Math.random() * (2005 - 1955 + 1));

    personas.push({
      email: `demo-${String(i).padStart(3, "0")}-${first.toLowerCase()}@${EMAIL_DOMAIN}`,
      displayName: `${first} ${lastInitial}.`,
      city: place.city,
      state: place.state,
      birthYear,
    });
  }

  return personas;
}

console.log(
  `seed-demo-players: creating ${accountCount} accounts, up to ${perAccount} ` +
    `guesses each, across ${activeDatasets.length} active dataset(s)...`,
);

const passwordHash = hashPassword(DEMO_PASSWORD);
const personas = makePersonas(accountCount);

let accountsCreated = 0;
let guessesInserted = 0;
const perDatasetCount = new Map<number, number>();

for (const persona of personas) {
  const userId = crypto.randomUUID();

  await sql`
    insert into users (id, email, password_hash, display_name, birth_year, city, state, country)
    values (
      ${userId}, ${persona.email}, ${passwordHash}, ${persona.displayName},
      ${persona.birthYear}, ${persona.city}, ${persona.state}, 'US'
    )
  `;
  accountsCreated += 1;

  const sessionId = crypto.randomUUID();
  const userAgent = pick(USER_AGENTS);
  const viewportWidth = pick(VIEWPORT_WIDTHS);

  const picks = shuffled(activeDatasets).slice(
    0,
    Math.min(perAccount, activeDatasets.length),
  );

  let guessesForPersona = 0;

  for (const { id: datasetId, dataset } of picks) {
    const truth = truthPathNormalized(dataset, PATH_POINTS);
    const [unitPath] = syntheticCrowd({
      truth,
      count: 1,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    const path = quantize(unitPath);
    const scored = scoreGuess(unitPath, truth);

    // Plausible, varied human draw behaviour - comfortably above the
    // too-fast threshold, occasionally redrawn, never all identical.
    const drawMs = 1500 + Math.round(Math.random() * 7000);
    const redrawCount = Math.random() < 0.2 ? 1 : 0;

    const assessment = assessGuess({
      path,
      drawMs,
      isDuplicate: false,
      userAgent,
    });

    await recordGuess({
      sessionId,
      userId,
      datasetId,
      path,
      pathResolution: PATH_POINTS,
      drawMs,
      redrawCount,
      viewportWidth,
      score: scored.score,
      meanAbsError: scored.meanAbsError,
      meanSignedError: scored.meanSignedError,
      reasons: assessment.reasons,
      session: {
        country: "US",
        deviceType: deviceTypeFrom(userAgent),
        referrerHost: null,
        uaHash: hashUserAgent(userAgent),
      },
    });

    guessesInserted += 1;
    guessesForPersona += 1;
    perDatasetCount.set(datasetId, (perDatasetCount.get(datasetId) ?? 0) + 1);
  }

  if (guessesForPersona >= 3) {
    // Best-effort - a streak failing to advance must never fail seeding.
    await maybeAdvanceStreak(userId).catch(() => {});
  }
}

console.log(
  `seed-demo-players: created ${accountsCreated} account(s), inserted ${guessesInserted} guess(es)`,
);

const maxPerDataset = Math.max(0, ...perDatasetCount.values());
console.log(
  `seed-demo-players: busiest dataset has ${maxPerDataset} demo guess(es) ` +
    "(kept well under the public crowd view's n=50 threshold on purpose)",
);
console.log("\nTo remove this demo data: npm run seed:demo-players -- --clean\n");

await sql.end();
