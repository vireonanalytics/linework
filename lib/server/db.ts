import postgres from "postgres";
import type { SuspectReason } from "./suspect.ts";
import { CROWD_MIN_N } from "../crowd/constants.ts";
import { recordQualifyingDay, type StreakState } from "../streak/compute.ts";
import { STREAK_QUALIFYING_CHARTS } from "../streak/compute.ts";
import { todayUtc } from "../daily/select.ts";
import { mintToken, hashToken, type TokenPurpose } from "./email-token.ts";
import type { Dataset } from "../types/dataset.ts";

/**
 * The one connection to Postgres.
 *
 * Supabase's transaction pooler is what a serverless function should talk to -
 * a direct connection per invocation exhausts the connection limit under any
 * real traffic. The pooler does not support prepared statements, hence
 * `prepare: false`; leaving that on produces errors that only appear under
 * concurrency, which is the worst way to find out.
 */

declare global {
  var __dtlSql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy it from Supabase > Project Settings > " +
        "Database > Connection string > Transaction pooler (port 6543).",
    );
  }

  if (/:5432\//.test(url) && process.env.NODE_ENV === "production") {
    console.warn(
      "[db] DATABASE_URL points at port 5432 (direct connection). Serverless " +
        "should use the transaction pooler on 6543 or it will exhaust " +
        "connections.",
    );
  }

  return postgres(url, {
    // Required by the transaction pooler.
    prepare: false,
    // Serverless: keep the pool small, let idle sockets go.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
  });
}

/**
 * Connect on first use, not on import.
 *
 * `next build` loads every route module to collect metadata. Connecting at
 * import time would make the build require DATABASE_URL, so a missing
 * environment variable would fail the build rather than the request that
 * actually needs a database - and CI would need production credentials to
 * compile.
 *
 * Cached on globalThis so a warm serverless instance reuses the pool instead of
 * opening one per invocation, and so Next's dev server does not leak a pool on
 * every hot reload.
 */
export function sql(): ReturnType<typeof postgres> {
  return (globalThis.__dtlSql ??= connect());
}

// ---------------------------------------------------------------------------
// datasets
// ---------------------------------------------------------------------------

export type DbDataset = {
  id: number;
  slug: string;
  yValues: number[];
  yDomain: [number, number];
  revealFromIndex: number;
  isActive: boolean;
  verified: boolean;
};

/**
 * Look up the series the score will be computed against.
 *
 * The truth comes from the database, never from the request. A client can say
 * which dataset it drew on; it cannot say what the answer was.
 */
export async function datasetBySlug(slug: string): Promise<DbDataset | null> {
  const rows = await sql()<
    {
      id: string;
      slug: string;
      y_values: number[];
      y_domain_min: number;
      y_domain_max: number;
      reveal_from_index: number;
      is_active: boolean;
      verified: boolean;
    }[]
  >`
    select id, slug, y_values, y_domain_min, y_domain_max,
           reveal_from_index, is_active, verified
    from datasets
    where slug = ${slug}
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    slug: row.slug,
    yValues: row.y_values,
    yDomain: [row.y_domain_min, row.y_domain_max],
    revealFromIndex: row.reveal_from_index,
    isActive: row.is_active,
    verified: row.verified,
  };
}

export type NextChartResult = {
  /** The chart to show next, or null if the player has answered everything active. */
  next: Dataset | null;
  /** How many more unanswered active charts remain AFTER this one. */
  remainingAfter: number;
};

/**
 * What a signed-in player sees next on the home page: the lowest-id active
 * dataset they have not already submitted a guess for, ever.
 *
 * Deliberately reads is_active from the DATABASE, not from the `activeDatasets`
 * array in lib/datasets/index.ts. Those two can disagree - the admin verify
 * flow (app/api/admin/datasets/[slug]/verify/route.ts) only ever updates the
 * database, never the source TypeScript files, so a dataset an admin just
 * verified is active in the database well before anyone hand-edits its
 * `isActive: false` literal in lib/datasets/*.ts (if that literal is ever
 * updated at all). Reading the TS array here would silently hide newly
 * -verified charts from signed-in players.
 *
 * "A user should get a certain question only once" (2026-08-26) is enforced
 * right here, unconditionally: ANY existing guesses row for (user, dataset) -
 * suspect-flagged or not - excludes that dataset from ever being served to
 * this user again. Not just a UI nicety: this is the query the home page's
 * server component calls on every load, so there is no client-side path that
 * can route around it.
 *
 * ORDER IS RANDOM PER USER (2026-08-27), not by dataset id. Two properties
 * matter and a plain `order by random()` only gives one of them:
 *
 *  - Different users must get different sequences. Ordering by id meant
 *    every single player worked through the identical list, so the earliest
 *    datasets accumulated all the responses and the later ones would have
 *    stayed at n=0 indefinitely - actively bad for a project whose output is
 *    per-dataset aggregates.
 *  - The SAME user must get a STABLE sequence. With `random()` the "next"
 *    chart would change on every page load and every router.refresh(),
 *    so a player who reloaded mid-thought would silently lose the chart
 *    they were looking at.
 *
 * Hashing (user id || dataset id) gives both: deterministic for a given
 * pair, uncorrelated across users. md5 is used as a cheap, always-available
 * mixing function here, not as a security primitive.
 */
export async function nextChartForUser(userId: string): Promise<NextChartResult> {
  const rows = await sql()<
    {
      id: string;
      slug: string;
      title: string;
      question: string;
      y_label: string;
      y_unit: string;
      x_values: string[];
      y_values: number[];
      reveal_from_index: number;
      y_domain_min: number;
      y_domain_max: number;
      source_name: string;
      source_url: string;
      verified: boolean;
      verified_on: string | null;
    }[]
  >`
    select d.id, d.slug, d.title, d.question, d.y_label, d.y_unit,
           d.x_values, d.y_values, d.reveal_from_index,
           d.y_domain_min, d.y_domain_max, d.source_name, d.source_url,
           d.verified, d.verified_on, d.reliability, d.reliability_note,
           d.source_series_id
    from datasets d
    where d.is_active = true
      /*
       * in_rotation narrows WHAT THE QUEUE HANDS OUT, and nothing else. A
       * held-back chart is still active: still playable by direct link, still
       * in the history of anyone who answered it, still counted by every
       * admin view. This exists so answers concentrate on a small pool while
       * charts are still short of CROWD_MIN_N - see the rotation migration.
       */
      and d.in_rotation = true
      and not exists (
        select 1 from guesses g
        where g.dataset_id = d.id and g.user_id = ${userId}
      )
    order by md5(${userId}::text || ':' || d.id::text)
  `;

  if (rows.length === 0) return { next: null, remainingAfter: 0 };

  const row = rows[0];
  const next: Dataset = {
    slug: row.slug,
    title: row.title,
    question: row.question,
    yLabel: row.y_label,
    yUnit: row.y_unit,
    xValues: row.x_values,
    yValues: row.y_values,
    revealFromIndex: row.reveal_from_index,
    yDomain: [row.y_domain_min, row.y_domain_max],
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    verified: row.verified,
    verifiedOn: row.verified_on ? String(row.verified_on).slice(0, 10) : null,
    isActive: true,
    reliability: (row as unknown as { reliability: Dataset["reliability"] }).reliability,
    reliabilityNote: (row as unknown as { reliability_note: string | null }).reliability_note,
    sourceSeriesId: (row as unknown as { source_series_id: string | null }).source_series_id,
  };

  return { next, remainingAfter: rows.length - 1 };
}

// ---------------------------------------------------------------------------
// rate limiting
// ---------------------------------------------------------------------------

/**
 * Atomically increment a window counter and return the new count.
 *
 * One statement, so two concurrent requests cannot both read the old value.
 */
export async function bumpRateLimit(
  bucket: string,
  expiresAt: Date,
): Promise<number> {
  const rows = await sql()<{ hits: number }[]>`
    insert into rate_limit (bucket, hits, expires_at)
    values (${bucket}, 1, ${expiresAt})
    on conflict (bucket) do update set hits = rate_limit.hits + 1
    returning hits
  `;
  return rows[0]?.hits ?? 1;
}

/** Opportunistic cleanup. Cheap, and saves needing a cron for one small table. */
export async function sweepRateLimit(): Promise<void> {
  await sql()`delete from rate_limit where expires_at < now()`;
}

// ---------------------------------------------------------------------------
// guesses
// ---------------------------------------------------------------------------

export type RecordGuessInput = {
  sessionId: string;
  /** Set when the player was signed in. Additional to sessionId, never a replacement for it. */
  userId: string | null;
  datasetId: number;
  path: number[];
  pathResolution: number;
  drawMs: number;
  redrawCount: number;
  viewportWidth: number;
  score: number;
  meanAbsError: number;
  meanSignedError: number;
  /** Reasons known before the duplicate check. */
  reasons: SuspectReason[];
  session: {
    country: string | null;
    deviceType: string | null;
    referrerHost: string | null;
    uaHash: string | null;
  };
};

export type RecordGuessResult = {
  id: number;
  orderInSession: number;
  /** This guess's position among every guess ever recorded for THIS dataset - "guess #N for this chart," not the global row id. */
  datasetGuessNumber: number;
  isSuspect: boolean;
  suspectReasons: string[];
};

/**
 * Create the session if this is its first guess, work out where this guess
 * falls in the session, and insert it - all in one transaction.
 *
 * The session row is created lazily rather than on first page view, so a
 * crawler that never draws anything leaves no row behind.
 *
 * The `for update` locks matter: without the session lock, two guesses
 * posted at once for the same session both read zero prior guesses, and
 * both get order_in_session = 1 with neither flagged as a duplicate.
 * Without the dataset lock, two guesses posted at once for the same dataset
 * (different sessions) could both read the same prior count and show the
 * same "guess #N for this chart" number to two different people. Locking
 * the session row, then the dataset row, serialises each independently -
 * always acquired in that order, so two concurrent inserts can never
 * deadlock waiting on each other's lock.
 */
export async function recordGuess(
  input: RecordGuessInput,
): Promise<RecordGuessResult> {
  return sql().begin(async (tx) => {
    await tx`
      insert into sessions (id, country, device_type, referrer_host, ua_hash)
      values (
        ${input.sessionId},
        ${input.session.country},
        ${input.session.deviceType},
        ${input.session.referrerHost},
        ${input.session.uaHash}
      )
      on conflict (id) do nothing
    `;

    await tx`select id from sessions where id = ${input.sessionId} for update`;

    const counts = await tx<{ total: number; for_dataset: number }[]>`
      select
        count(*)::int as total,
        count(*) filter (where dataset_id = ${input.datasetId})::int as for_dataset
      from guesses
      where session_id = ${input.sessionId}
    `;

    const total = counts[0]?.total ?? 0;
    const forDataset = counts[0]?.for_dataset ?? 0;

    const reasons: string[] = [...input.reasons];
    if (forDataset > 0 && !reasons.includes("duplicate-in-session")) {
      reasons.push("duplicate-in-session");
    }

    await tx`select id from datasets where id = ${input.datasetId} for update`;

    const datasetCounts = await tx<{ n: number }[]>`
      select count(*)::int as n from guesses where dataset_id = ${input.datasetId}
    `;
    const datasetGuessNumber = (datasetCounts[0]?.n ?? 0) + 1;

    const rows = await tx<
      {
        id: string;
        order_in_session: number;
        is_suspect: boolean;
        suspect_reasons: string[];
      }[]
    >`
      insert into guesses (
        session_id, user_id, dataset_id, path, path_resolution, order_in_session,
        draw_ms, redraw_count, viewport_w,
        score, mean_abs_error, mean_signed_error,
        is_suspect, suspect_reasons
      ) values (
        ${input.sessionId},
        ${input.userId},
        ${input.datasetId},
        ${input.path}::smallint[],
        ${input.pathResolution},
        ${total + 1},
        ${input.drawMs},
        ${input.redrawCount},
        ${input.viewportWidth},
        ${input.score},
        ${input.meanAbsError},
        ${input.meanSignedError},
        ${reasons.length > 0},
        ${reasons}::text[]
      )
      returning id, order_in_session, is_suspect, suspect_reasons
    `;

    const row = rows[0];

    return {
      id: Number(row.id),
      orderInSession: row.order_in_session,
      datasetGuessNumber,
      isSuspect: row.is_suspect,
      suspectReasons: row.suspect_reasons,
    };
  }) as Promise<RecordGuessResult>;
}

// ---------------------------------------------------------------------------
// crowd
// ---------------------------------------------------------------------------
//
// Every read here is a plain SELECT against crowd_stats / crowd_sample - both
// precomputed on a schedule by recompute_crowd_stats() (see
// supabase/migrations/20260826150914_crowd_stats.sql). Nothing in this
// section aggregates on request.

export type CrowdBelowThreshold = {
  belowThreshold: true;
  n: number;
  minRequired: number;
};

export type CrowdReady = {
  belowThreshold: false;
  n: number;
  computedAt: string;
  /** Index-aligned with guesses.path: percentiles[i] is x_index i. */
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  /** A capped sample of raw paths, for the ink-density layer. */
  sample: number[][];
};

export type CrowdResult = CrowdBelowThreshold | CrowdReady;

/**
 * Everything the crowd view needs for one dataset, in one round trip.
 *
 * Returns the cold-start shape below CROWD_MIN_N unflagged guesses - see
 * lib/crowd/constants.ts. A dataset with zero rows in crowd_stats (nobody has
 * played it, or every guess so far got flagged) is indistinguishable from
 * "below threshold at n=0", which is the correct read: no data is the
 * smallest case of not enough data.
 */
export async function crowdForDataset(datasetId: number): Promise<CrowdResult> {
  const rows = await sql()<
    {
      x_index: number;
      n: number;
      p10: number;
      p25: number;
      p50: number;
      p75: number;
      p90: number;
      computed_at: string;
    }[]
  >`
    select x_index, n, p10, p25, p50, p75, p90, computed_at
    from crowd_stats
    where dataset_id = ${datasetId}
    order by x_index
  `;

  const n = rows[0]?.n ?? 0;

  if (rows.length === 0 || n < CROWD_MIN_N) {
    return { belowThreshold: true, n, minRequired: CROWD_MIN_N };
  }

  const percentiles = {
    p10: rows.map((r) => r.p10),
    p25: rows.map((r) => r.p25),
    p50: rows.map((r) => r.p50),
    p75: rows.map((r) => r.p75),
    p90: rows.map((r) => r.p90),
  };

  const sampleRows = await sql()<{ path: number[] }[]>`
    select path from crowd_sample where dataset_id = ${datasetId}
  `;

  return {
    belowThreshold: false,
    n,
    computedAt: rows[0].computed_at,
    percentiles,
    sample: sampleRows.map((r) => r.path),
  };
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

/**
 * A Postgres DATE, as a plain YYYY-MM-DD string.
 *
 * THIS EXISTS BECAUSE OF A REAL BUG (2026-08-28). Streaks reset to 1 on every
 * play: a user with three consecutive qualifying days showed current=1 while
 * longest correctly showed 3.
 *
 * postgres.js hydrates a DATE column into a JS Date, and the code compared it
 * with `String(value).slice(0, 10)`. That yields "Thu Aug 27", never
 * "2026-08-27", so:
 *
 *   - maybeAdvanceStreak's "already counted today" check could never match,
 *     so it re-ran on every single guess; and
 *   - the value handed to recordQualifyingDay was an unparseable date, which
 *     read as an enormous gap and reset the streak every time.
 *
 * The second failure is the nastier one, and it is why `longest` looked right
 * while `current` did not: longest is a high-water mark and survived, current
 * was recomputed from garbage.
 *
 * String(Date) is also LOCAL-time, so on any server behind UTC it names the
 * previous day - the same class of mistake as the timestamps that had to be
 * fixed with toIso() in Session 8. Both now go through a helper rather than
 * ad-hoc stringification, because this is the third time a date has been
 * formatted by accident in this codebase.
 */
export function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Already text (to_char, or a driver returning a string): trust the first
  // ten characters only if they actually look like a date.
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

export type DbUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  birthYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationMismatchFlag: boolean;
  role: "user" | "admin";
  /** Set when an admin has blocked this account. */
  blockedAt: string | null;
  /** Set when the address was confirmed by clicking the emailed link. */
  emailVerifiedAt: string | null;
  streak: StreakState;
};

function rowToUser(row: Record<string, unknown>): DbUser {
  return {
    id: row.id as string,
    email: row.email as string,
    passwordHash: row.password_hash as string | null,
    displayName: row.display_name as string,
    birthYear: row.birth_year as number | null,
    city: row.city as string | null,
    state: row.state as string | null,
    country: row.country as string | null,
    locationMismatchFlag: row.location_mismatch_flag as boolean,
    role: row.role as "user" | "admin",
    // Present only on the queries that select it; undefined elsewhere, which
    // callers treat as "not known here" rather than "not blocked".
    blockedAt: row.blocked_at ? String(row.blocked_at) : null,
    emailVerifiedAt: row.email_verified_at ? String(row.email_verified_at) : null,
    streak: {
      currentStreak: row.current_streak as number,
      longestStreak: row.longest_streak as number,
      lastActiveDate: toDateOnly(row.last_active_date),
      freezesAvailable: row.streak_freezes_available as number,
    },
  };
}

export async function userByEmail(email: string): Promise<DbUser | null> {
  const rows = await sql()`
    select id, email, password_hash, display_name, birth_year, city, state,
           country, location_mismatch_flag, role, current_streak,
           longest_streak, last_active_date, streak_freezes_available,
           blocked_at, email_verified_at
    from users where email = ${email.toLowerCase()}
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// email log
// ---------------------------------------------------------------------------

/**
 * Record a send attempt. Never throws.
 *
 * Wrapped in its own try/catch because this is a diagnostic: if writing the
 * diagnostic can break the thing being diagnosed, it is worse than not having
 * it. A password reset must not fail because a log insert did.
 */
export async function logEmailAttempt(entry: {
  to: string;
  kind: string;
  ok: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    await sql()`
      insert into email_log (to_email, kind, ok, error)
      values (${entry.to}, ${entry.kind}, ${entry.ok}, ${entry.error ?? null})
    `;
  } catch (error) {
    console.error("[email-log] could not record attempt", error);
  }
}

export type EmailLogRow = {
  id: number;
  toEmail: string;
  kind: string;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

export async function recentEmailLog(limit = 25): Promise<EmailLogRow[]> {
  const rows = await sql()`
    select id, to_email, kind, ok, error, created_at
    from email_log order by created_at desc limit ${limit}
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    toEmail: r.to_email as string,
    kind: r.kind as string,
    ok: r.ok as boolean,
    error: (r.error as string | null) ?? null,
    createdAt: toIso(r.created_at as string),
  }));
}

// ---------------------------------------------------------------------------
// email verification and password reset
// ---------------------------------------------------------------------------

/**
 * Mint a token and store only its hash.
 *
 * Any UNCONSUMED token of the same purpose for this user is invalidated in
 * the same transaction. Two reasons, and the second is the important one:
 * requesting a new link should make the old one stop working (people forward
 * and re-request when a link "doesn't work", leaving live keys scattered
 * through a mailbox), and it caps how many valid reset links can exist for an
 * account at one - so a flood of requests cannot widen the attack surface.
 */
export async function createEmailToken(
  userId: string,
  purpose: TokenPurpose,
): Promise<string> {
  const { raw, hash, expiresAt } = mintToken(purpose);

  await sql().begin(async (tx) => {
    await tx`
      update email_tokens set consumed_at = now()
      where user_id = ${userId} and purpose = ${purpose} and consumed_at is null
    `;
    await tx`
      insert into email_tokens (user_id, purpose, token_hash, expires_at)
      values (${userId}, ${purpose}, ${hash}, ${expiresAt})
    `;
  });

  return raw;
}

export type ConsumedToken = { userId: string };

/**
 * Redeem a token, atomically.
 *
 * The whole check lives in ONE statement's WHERE clause - unconsumed, not
 * expired, right purpose - and the same statement stamps consumed_at. That
 * matters: reading the row, validating it in JavaScript and then updating it
 * would leave a window in which two concurrent requests both pass validation
 * and both act, which for a reset token means one link used twice. Postgres
 * serialises the update, so exactly one caller can ever see a returned row.
 *
 * Looked up BY HASH, so a raw token from a URL is never compared against
 * anything - it is hashed and used as a key. There is nothing to time.
 */
export async function consumeEmailToken(
  rawToken: string,
  purpose: TokenPurpose,
): Promise<ConsumedToken | null> {
  const rows = await sql()<{ user_id: string }[]>`
    update email_tokens set consumed_at = now()
    where token_hash = ${hashToken(rawToken)}
      and purpose = ${purpose}
      and consumed_at is null
      and expires_at > now()
    returning user_id
  `;
  const row = rows[0];
  return row ? { userId: row.user_id } : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  // coalesce so a second confirmation keeps the ORIGINAL timestamp - when the
  // address was first proven is the fact worth keeping.
  await sql()`
    update users set email_verified_at = coalesce(email_verified_at, now())
    where id = ${userId}
  `;
}

/**
 * Set a new password hash and invalidate every outstanding reset token.
 *
 * The invalidation is the security-relevant half. Without it, a reset link
 * sitting in an inbox stays usable AFTER the password has been changed - so
 * an attacker who triggered a reset earlier could still take the account back
 * from the owner who just recovered it. Changing a password must close every
 * other door at the same moment, so both happen in one transaction.
 */
export async function setUserPassword(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await sql().begin(async (tx) => {
    await tx`update users set password_hash = ${passwordHash} where id = ${userId}`;
    await tx`
      update email_tokens set consumed_at = now()
      where user_id = ${userId} and purpose = 'reset_password' and consumed_at is null
    `;
  });
}

/** Opportunistic cleanup; this table is entirely disposable. */
export async function sweepExpiredEmailTokens(): Promise<void> {
  await sql()`
    delete from email_tokens
    where expires_at < now() - interval '7 days'
  `;
}

export async function userById(id: string): Promise<DbUser | null> {
  const rows = await sql()`
    select id, email, password_hash, display_name, birth_year, city, state,
           country, location_mismatch_flag, role, current_streak,
           longest_streak, last_active_date, streak_freezes_available,
           blocked_at, email_verified_at
    from users where id = ${id}
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

export type CreateUserInput = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  birthYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationMismatchFlag: boolean;
};

/** Recorded at signup, never back-filled. See the migration's own note. */


export type CreateUserResult =
  | { ok: true; user: DbUser }
  | { ok: false; reason: "email-taken" };

/**
 * Create a new account, OR complete a pre-seeded stub row (one with no
 * password yet - see scripts/seed-admin.ts) if the email matches one.
 *
 * The `where users.password_hash is null` clause is what makes this safe: a
 * conflict against a REAL existing account (one that already has a password)
 * fails the WHERE, so neither the insert nor the update applies and nothing
 * comes back from RETURNING - that is read as "email-taken" below. A
 * conflict against a passwordless stub passes the WHERE, so the update
 * completes it. Either way `role` is never touched by this statement, so a
 * pre-seeded admin stays admin and a fresh signup gets the column default
 * ('user') automatically.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const rows = await sql()`
    insert into users (
      id, email, password_hash, display_name, birth_year, city, state,
      country, location_mismatch_flag, terms_accepted_at
    ) values (
      ${input.id}, ${input.email.toLowerCase()}, ${input.passwordHash},
      ${input.displayName}, ${input.birthYear}, ${input.city}, ${input.state},
      ${input.country}, ${input.locationMismatchFlag}, now()
    )
    on conflict (email) do update set
      password_hash           = excluded.password_hash,
      display_name             = excluded.display_name,
      birth_year                = excluded.birth_year,
      city                       = excluded.city,
      state                       = excluded.state,
      country                      = excluded.country,
      location_mismatch_flag        = excluded.location_mismatch_flag,
      terms_accepted_at               = now(),
      updated_at                       = now()
    where users.password_hash is null
    returning id, email, password_hash, display_name, birth_year, city, state,
              country, location_mismatch_flag, role, current_streak,
              longest_streak, last_active_date, streak_freezes_available
  `;

  if (rows.length === 0) return { ok: false, reason: "email-taken" };
  return { ok: true, user: rowToUser(rows[0]) };
}

/**
 * Full-replacement semantics, deliberately - the caller (the account PATCH
 * route) always has the current profile in hand and submits the complete
 * desired state, not a sparse "only what changed" patch. That keeps this
 * query simple and unambiguous instead of needing to distinguish "field
 * omitted" from "field explicitly cleared to null."
 */
export type ProfileUpdate = {
  displayName: string;
  birthYear: number | null;
  city: string | null;
  state: string | null;
  locationMismatchFlag: boolean;
};

export async function updateUserProfile(
  id: string,
  next: ProfileUpdate,
): Promise<DbUser | null> {
  const rows = await sql()`
    update users set
      display_name = ${next.displayName},
      birth_year = ${next.birthYear},
      city = ${next.city},
      state = ${next.state},
      location_mismatch_flag = ${next.locationMismatchFlag}
    where id = ${id}
    returning id, email, password_hash, display_name, birth_year, city, state,
              country, location_mismatch_flag, role, current_streak,
              longest_streak, last_active_date, streak_freezes_available
  `;
  return rows[0] ? rowToUser(rows[0]) : null;
}

/**
 * Persist the outcome of lib/streak/compute.ts's recordQualifyingDay(). Pure
 * logic decides the next state; this just writes it.
 */
export async function saveStreakState(id: string, streak: StreakState): Promise<void> {
  await sql()`
    update users set
      current_streak = ${streak.currentStreak},
      longest_streak = ${streak.longestStreak},
      last_active_date = ${streak.lastActiveDate},
      streak_freezes_available = ${streak.freezesAvailable}
    where id = ${id}
  `;
}

export type DailyGoalProgress = {
  /** Distinct datasets answered today, capped for display at the goal. */
  chartsToday: number;
  goal: number;
  met: boolean;
};

/**
 * Read-only view of today's streak progress, for deciding whether to show the
 * "any 3 today keeps your streak" prompt.
 *
 * Requested 2026-08-27: the prompt should disappear once the goal is done,
 * because a nudge toward something already finished reads as the app not
 * knowing what the player just did.
 *
 * `last_active_date === today` is treated as authoritative and short-circuits
 * the count. That column is written by maybeAdvanceStreak at the moment the
 * threshold is crossed, so it is the same fact this function is trying to
 * report - and trusting it means the banner can never contradict the streak
 * the player can see on their account page. The count runs only when the goal
 * has NOT yet been recorded, which is exactly when a progress number is
 * useful.
 *
 * Deliberately does not lock: this is a read for a banner, and a stale-by-
 * milliseconds count here has no consequence, unlike the counted decision
 * inside maybeAdvanceStreak that must not double-fire.
 */
export async function dailyGoalProgress(userId: string): Promise<DailyGoalProgress> {
  const today = todayUtc();
  const goal = STREAK_QUALIFYING_CHARTS;

  const userRows = await sql()<{ last_active_date: string | null }[]>`
    select last_active_date from users where id = ${userId}
  `;
  const lastActive = userRows[0]?.last_active_date;
  if (toDateOnly(lastActive) === today) {
    return { chartsToday: goal, goal, met: true };
  }

  const countRows = await sql()<{ n: number }[]>`
    select count(distinct dataset_id)::int as n
    from guesses
    where user_id = ${userId}
      and not is_suspect
      and created_at >= ${today}::date
      and created_at < ${today}::date + interval '1 day'
  `;
  const chartsToday = countRows[0]?.n ?? 0;
  return { chartsToday, goal, met: chartsToday >= goal };
}

/**
 * Call after a successful guess for a signed-in user. Advances the streak
 * exactly once per day, at the moment the player's distinct-dataset guess
 * count for today first reaches STREAK_QUALIFYING_CHARTS (3) - not on every
 * guess, and not again later the same day.
 *
 * Locks the user row for the duration, the same reason recordGuess locks the
 * session row: two guesses landing at once for the same user must not both
 * read "count = 2" and both decide they were the one that crossed the
 * threshold.
 */
export async function maybeAdvanceStreak(userId: string): Promise<void> {
  const today = todayUtc();

  await sql().begin(async (tx) => {
    const userRows = await tx`
      select current_streak, longest_streak, last_active_date, streak_freezes_available
      from users where id = ${userId} for update
    `;
    const row = userRows[0];
    if (!row) return;

    // Already recorded today - no need to even count guesses.
    if (toDateOnly(row.last_active_date) === today) {
      return;
    }

    const countRows = await tx<{ n: number }[]>`
      select count(distinct dataset_id)::int as n
      from guesses
      where user_id = ${userId}
        and not is_suspect
        and created_at >= ${today}::date
        and created_at < ${today}::date + interval '1 day'
    `;
    const chartsToday = countRows[0]?.n ?? 0;

    if (chartsToday < STREAK_QUALIFYING_CHARTS) return;

    const state: StreakState = {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastActiveDate: toDateOnly(row.last_active_date),
      freezesAvailable: row.streak_freezes_available,
    };

    const { next } = recordQualifyingDay(state, today);

    await tx`
      update users set
        current_streak = ${next.currentStreak},
        longest_streak = ${next.longestStreak},
        last_active_date = ${next.lastActiveDate},
        streak_freezes_available = ${next.freezesAvailable}
      where id = ${userId}
    `;
  });
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export type AdminDatasetRow = {
  slug: string;
  title: string;
  reliability: "green" | "yellow" | "red";
  reliabilityNote: string | null;
  sourceSeriesId: string | null;
  sourceName: string;
  sourceUrl: string;
  methodologyNote: string | null;
  verified: boolean;
  verifiedOn: string | null;
  isActive: boolean;
  /**
   * Set when the chart left scripts/wb-catalogue.ts. Surfaced to the admin
   * because "verified" and "live" came apart the moment retirement existed:
   * a retired chart stays verified (the data was fine) but is not served, and
   * a list that splits only on `verified` counts it as live. That is exactly
   * how the admin panel reported 564 charts when 275 were being served.
   */
  retiredAt: string | null;
  /**
   * Who withdrew it. 'catalogue' = the import no longer produces this slug,
   * and re-importing brings it back. 'admin' = a human decided, and only a
   * human can undo it. Shown in the archive so an admin can tell their own
   * decisions apart from the importer's housekeeping.
   */
  retiredReason: "catalogue" | "admin" | null;
  /** Full series, revealed and hidden portions both - for the admin preview only. */
  yValues: number[];
  yDomain: [number, number];
  revealFromIndex: number;
  analysis: {
    /** Unflagged guesses - the number every published aggregate would use. */
    cleanGuessCount: number;
    suspectCount: number;
    registeredCount: number;
    anonymousCount: number;
    avgScore: number | null;
    avgSignedError: number | null;
  };
};

/**
 * Every dataset, verified or not, active or not - the admin dashboard is
 * the one place in this app allowed to see the ones the public game cannot.
 * Callers must have already checked session.user.role === 'admin'; this
 * function does not check it itself, the same way every other db.ts
 * function trusts its caller to have done authorization first.
 *
 * Includes the full series (for a mini chart preview - "how will the graph
 * look during the game") and a per-dataset guess analysis, so the admin
 * dashboard does not need a second round trip per row.
 */
/**
 * Just the number of retired charts, for the link on the admin dashboard.
 *
 * A separate one-row query rather than reusing allDatasetsForAdmin({retired:
 * true}) and reading .length: that fetches every retired row with its full
 * y_values series and its guess aggregates, which is a lot of work to render
 * a single integer, and the cost grows with every import.
 */
export async function retiredDatasetCount(): Promise<number> {
  const rows = await sql()<{ n: number }[]>`
    select count(*)::int as n from datasets where retired_at is not null
  `;
  return rows[0]?.n ?? 0;
}

/**
 * Datasets for the admin list, split by whether they are retired.
 *
 * The split happens in SQL rather than in the component because the two
 * groups are now two separate PAGES. Fetching all 585 rows - each carrying a
 * full y_values series for its sparkline - to render 293 of them was wasteful
 * once the retired ones moved to their own panel, and it is exactly the kind
 * of "filter it on the client" shortcut that stops being free at this size.
 *
 * `retired: false` (the default) is the working list: what is live or waiting
 * to be reviewed. `retired: true` is the archive.
 */
export async function allDatasetsForAdmin(
  { retired = false }: { retired?: boolean } = {},
): Promise<AdminDatasetRow[]> {
  const rows = await sql()`
    select
      d.slug, d.title, d.source_name, d.source_url, d.methodology_note,
      d.verified, d.verified_on, d.is_active, d.retired_at, d.retired_reason,
      d.reliability, d.reliability_note, d.source_series_id,
      d.y_values, d.y_domain_min, d.y_domain_max, d.reveal_from_index,
      count(g.id) filter (where not g.is_suspect)::int as clean_guess_count,
      count(g.id) filter (where g.is_suspect)::int as suspect_count,
      count(g.id) filter (where not g.is_suspect and g.user_id is not null)::int as registered_count,
      count(g.id) filter (where not g.is_suspect and g.user_id is null)::int as anonymous_count,
      avg(g.score) filter (where not g.is_suspect) as avg_score,
      avg(g.mean_signed_error) filter (where not g.is_suspect) as avg_signed_error
    from datasets d
    left join guesses g on g.dataset_id = d.id
    where d.retired_at is ${retired ? sql()`not null` : sql()`null`}
    group by d.id
    order by ${retired ? sql()`d.retired_at desc` : sql()`d.verified asc, d.title asc`}
  `;

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    reliability: r.reliability,
    reliabilityNote: r.reliability_note,
    sourceSeriesId: r.source_series_id,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    methodologyNote: r.methodology_note,
    verified: r.verified,
    verifiedOn: r.verified_on ? String(r.verified_on).slice(0, 10) : null,
    isActive: r.is_active,
    retiredAt: r.retired_at ? toIso(r.retired_at) : null,
    retiredReason: r.retired_reason ?? null,
    yValues: r.y_values,
    yDomain: [r.y_domain_min, r.y_domain_max],
    revealFromIndex: r.reveal_from_index,
    analysis: {
      cleanGuessCount: r.clean_guess_count,
      suspectCount: r.suspect_count,
      registeredCount: r.registered_count,
      anonymousCount: r.anonymous_count,
      avgScore: r.avg_score === null ? null : Number(r.avg_score),
      avgSignedError: r.avg_signed_error === null ? null : Number(r.avg_signed_error),
    },
  }));
}

export type AdminDatasetDetail = AdminDatasetRow & {
  id: number;
  question: string;
  medianScore: number | null;
  stdevSignedError: number | null;
  /** Why flagged guesses (excluded from every stat above) got flagged, most common first. */
  suspectBreakdown: { reason: string; count: number }[];
};

/**
 * The drill-down behind "for every question in the admin tab, I should be
 * able to access it and see how replies are looking right now and what can
 * be inferred from it" (2026-08-26) - this is the research output the whole
 * project exists to produce, e.g. "on average Americans overestimate X."
 *
 * Every number here is computed live, on request - unlike crowd_stats (see
 * crowdForDataset below), which is precomputed on a schedule and gated at
 * CROWD_MIN_N so the PUBLIC game never presents noise as consensus. That
 * gate is a public-facing guardrail, not an admin one: an admin deciding
 * whether a source is trustworthy needs to see the real count even at n=1,
 * not a "not enough data yet" placeholder.
 */
export type AdminDatasetFilters = {
  /** Full state name, matching users.state (see lib/geo/us-states.ts). */
  state?: string | null;
  city?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

/**
 * A guess only has demographics if it is linked to a user with a profile -
 * an anonymous guess (g.user_id null) never matches a non-null filter, so
 * activating any filter here implicitly restricts to signed-in players with
 * a matching profile. That is stated on the admin page itself, not just
 * assumed silently.
 *
 * Built fresh on every call rather than cached, so it is safe to interpolate
 * the same condition into several `filter (where ...)` clauses in one query
 * without the fragments fighting over parameter placeholders.
 */
function demographicCondition(filters: AdminDatasetFilters) {
  const state = filters.state ?? null;
  const city = filters.city ?? null;
  const ageMin = filters.ageMin ?? null;
  const ageMax = filters.ageMax ?? null;

  return sql()`
    (${state}::text is null or gu.state = ${state})
    and (${city}::text is null or lower(gu.city) = lower(${city}))
    and (
      ${ageMin}::int is null
      or (gu.birth_year is not null and (extract(year from now())::int - gu.birth_year) >= ${ageMin})
    )
    and (
      ${ageMax}::int is null
      or (gu.birth_year is not null and (extract(year from now())::int - gu.birth_year) <= ${ageMax})
    )
  `;
}

export async function datasetDetailForAdmin(
  slug: string,
  filters: AdminDatasetFilters = {},
): Promise<AdminDatasetDetail | null> {
  const rows = await sql()`
    select
      d.id, d.slug, d.title, d.question, d.source_name, d.source_url,
      d.methodology_note, d.verified, d.verified_on, d.is_active, d.retired_at,
      d.retired_reason, d.reliability, d.reliability_note, d.source_series_id,
      d.y_values, d.y_domain_min, d.y_domain_max, d.reveal_from_index,
      count(g.id) filter (where not g.is_suspect and ${demographicCondition(filters)})::int as clean_guess_count,
      count(g.id) filter (where g.is_suspect and ${demographicCondition(filters)})::int as suspect_count,
      count(g.id) filter (where not g.is_suspect and g.user_id is not null and ${demographicCondition(filters)})::int as registered_count,
      count(g.id) filter (where not g.is_suspect and g.user_id is null and ${demographicCondition(filters)})::int as anonymous_count,
      avg(g.score) filter (where not g.is_suspect and ${demographicCondition(filters)}) as avg_score,
      percentile_cont(0.5) within group (order by g.score)
        filter (where not g.is_suspect and ${demographicCondition(filters)}) as median_score,
      avg(g.mean_signed_error) filter (where not g.is_suspect and ${demographicCondition(filters)}) as avg_signed_error,
      stddev(g.mean_signed_error) filter (where not g.is_suspect and ${demographicCondition(filters)}) as stdev_signed_error
    from datasets d
    left join guesses g on g.dataset_id = d.id
    left join users gu on gu.id = g.user_id
    where d.slug = ${slug}
    group by d.id
  `;

  const row = rows[0];
  if (!row) return null;

  const reasonRows = await sql()<{ reason: string; n: number }[]>`
    select reason, count(*)::int as n
    from guesses g
    left join users gu on gu.id = g.user_id,
    unnest(g.suspect_reasons) as reason
    where g.dataset_id = ${row.id} and g.is_suspect and ${demographicCondition(filters)}
    group by reason
    order by n desc
  `;

  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    question: row.question,
    retiredAt: row.retired_at ? toIso(row.retired_at) : null,
    retiredReason: row.retired_reason ?? null,
    reliability: row.reliability,
    reliabilityNote: row.reliability_note,
    sourceSeriesId: row.source_series_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    methodologyNote: row.methodology_note,
    verified: row.verified,
    verifiedOn: row.verified_on ? String(row.verified_on).slice(0, 10) : null,
    isActive: row.is_active,
    yValues: row.y_values,
    yDomain: [row.y_domain_min, row.y_domain_max],
    revealFromIndex: row.reveal_from_index,
    analysis: {
      cleanGuessCount: row.clean_guess_count,
      suspectCount: row.suspect_count,
      registeredCount: row.registered_count,
      anonymousCount: row.anonymous_count,
      avgScore: row.avg_score === null ? null : Number(row.avg_score),
      avgSignedError: row.avg_signed_error === null ? null : Number(row.avg_signed_error),
    },
    medianScore: row.median_score === null ? null : Number(row.median_score),
    stdevSignedError: row.stdev_signed_error === null ? null : Number(row.stdev_signed_error),
    suspectBreakdown: reasonRows.map((r) => ({ reason: r.reason, count: r.n })),
  };
}

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------

/**
 * postgres.js hands back a JS Date for timestamptz. String()-ing one of
 * those produces "Wed Aug 26 2026 14:43:25 GMT-0700 (Pacific Daylight
 * Time)" - the SERVER's locale and timezone, which is meaningless in an
 * export that someone will parse in a spreadsheet or a notebook, and which
 * silently changes if the deployment region ever moves. ISO 8601 UTC is the
 * only sane wire format for a timestamp leaving this system.
 */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

/**
 * One answered chart, for the review page - scoped to its owner.
 *
 * The `user_id = ...` clause is the whole access control: a guess id is a
 * small integer that anyone can guess at, so this is looked up as "this
 * user's guess with this id" rather than "this guess, then check who owns
 * it". A row that is not yours simply does not exist here, which is both
 * safer than an ownership check after the fact and indistinguishable from a
 * deleted guess - so the page cannot be used to probe which ids are real.
 */
/**
 * Any single guess, for an ADMIN to inspect - not scoped to an owner.
 *
 * Deliberately a separate function from answeredChartForUser rather than a
 * flag on it. That one's entire security property is that the ownership check
 * lives inside the query; adding an "unless you are an admin" branch would
 * put the most sensitive condition in this file behind a boolean argument,
 * where a wrong call site silently becomes an IDOR. Two functions cannot be
 * confused for one another, and the caller of THIS one is responsible for
 * having checked the role - which app/admin/guesses/[guessId]/page.tsx does
 * before calling it, exactly like every other admin surface.
 *
 * Also unlike the player view, this does NOT require the dataset to still be
 * active: an admin reviewing why an account was flagged needs to see the
 * response even if the chart has since been retired.
 */
export async function guessForAdmin(guessId: number): Promise<
  | (HistoryEntry & {
      datasetId: number;
      sourceName: string;
      sourceUrl: string;
      yLabel: string;
      yUnit: string;
      userEmail: string | null;
      userId: string | null;
    })
  | null
> {
  const rows = await sql()`
    select
      g.id, g.created_at, g.score, g.mean_signed_error, g.is_suspect, g.path,
      g.user_id, u.email as user_email,
      d.id as dataset_id, d.slug, d.title, d.question, d.x_values, d.y_values,
      d.y_domain_min, d.y_domain_max, d.reveal_from_index,
      d.source_name, d.source_url, d.y_label, d.y_unit
    from guesses g
    join datasets d on d.id = g.dataset_id
    left join users u on u.id = g.user_id
    where g.id = ${guessId}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    guessId: Number(r.id),
    datasetId: Number(r.dataset_id),
    slug: r.slug as string,
    title: r.title as string,
    question: r.question as string,
    playedAt: toIso(r.created_at as string),
    score: r.score as number,
    meanSignedError: Number(r.mean_signed_error),
    isSuspect: r.is_suspect as boolean,
    path: r.path as number[],
    yValues: r.y_values as number[],
    yDomain: [r.y_domain_min, r.y_domain_max] as [number, number],
    revealFromIndex: r.reveal_from_index as number,
    xValues: r.x_values as string[],
    sourceName: r.source_name as string,
    sourceUrl: r.source_url as string,
    yLabel: r.y_label as string,
    yUnit: r.y_unit as string,
    userEmail: (r.user_email as string | null) ?? null,
    userId: (r.user_id as string | null) ?? null,
  };
}

export async function answeredChartForUser(
  userId: string,
  guessId: number,
): Promise<(HistoryEntry & { datasetId: number; sourceName: string; sourceUrl: string; yLabel: string; yUnit: string }) | null> {
  const rows = await sql()`
    select
      g.id, g.created_at, g.score, g.mean_signed_error, g.is_suspect, g.path,
      d.id as dataset_id, d.slug, d.title, d.question, d.x_values, d.y_values,
      d.y_domain_min, d.y_domain_max, d.reveal_from_index,
      d.source_name, d.source_url, d.y_label, d.y_unit
    from guesses g
    join datasets d on d.id = g.dataset_id
    where g.id = ${guessId} and g.user_id = ${userId} and d.is_active = true
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    guessId: Number(r.id),
    datasetId: Number(r.dataset_id),
    slug: r.slug as string,
    title: r.title as string,
    question: r.question as string,
    playedAt: toIso(r.created_at as string),
    score: r.score as number,
    meanSignedError: Number(r.mean_signed_error),
    isSuspect: r.is_suspect as boolean,
    path: r.path as number[],
    yValues: r.y_values as number[],
    yDomain: [r.y_domain_min, r.y_domain_max] as [number, number],
    revealFromIndex: r.reveal_from_index as number,
    xValues: r.x_values as string[],
    sourceName: r.source_name as string,
    sourceUrl: r.source_url as string,
    yLabel: r.y_label as string,
    yUnit: r.y_unit as string,
  };
}

export type HistoryEntry = {
  guessId: number;
  slug: string;
  title: string;
  question: string;
  playedAt: string;
  score: number;
  meanSignedError: number;
  isSuspect: boolean;
  /** The player's stored path, 0..1000 scale, and the series to draw it against. */
  path: number[];
  yValues: number[];
  yDomain: [number, number];
  revealFromIndex: number;
  xValues: string[];
};

/**
 * Everything a signed-in player has already answered, newest first.
 *
 * "A user can only play a certain graph once, but they should be able to
 * view their past answers for past graphs somewhere" (2026-08-27). The
 * once-only rule (nextChartForUser) is what makes this necessary: without a
 * history view, a played chart simply vanishes and the player can never see
 * what they drew or how they did.
 *
 * Returns the stored path alongside the dataset series so the history page
 * can re-render the actual line the player drew, rather than just a score.
 * That is the whole point - a number is not a memory of a drawing.
 */
export async function historyForUser(userId: string): Promise<HistoryEntry[]> {
  const rows = await sql()`
    select
      g.id, g.created_at, g.score, g.mean_signed_error, g.is_suspect, g.path,
      d.slug, d.title, d.question, d.x_values, d.y_values,
      d.y_domain_min, d.y_domain_max, d.reveal_from_index
    from guesses g
    join datasets d on d.id = g.dataset_id
    where g.user_id = ${userId}
      /*
       * Deactivated charts disappear from "Your answers" (requested
       * 2026-08-27). A chart pulled from circulation - retired by an admin,
       * withdrawn from the catalogue, or unverified pending review - should
       * not keep surfacing to players through their history.
       *
       * Filtering on is_active rather than retired_at is deliberate: it is
       * the single column that answers "is this chart currently in
       * circulation", and it covers all three cases above rather than only
       * retirement. A chart that comes back reappears in everyone's history
       * automatically.
       *
       * This HIDES, it does not delete. The guess row, its full 40-point
       * path and every aggregate built on it are untouched - the research
       * data is not what is being withdrawn here, only the player-facing
       * view of it.
       */
      and d.is_active = true
    order by g.created_at desc
  `;

  return rows.map((r) => ({
    guessId: Number(r.id),
    slug: r.slug,
    title: r.title,
    question: r.question,
    playedAt: toIso(r.created_at),
    score: r.score,
    meanSignedError: Number(r.mean_signed_error),
    isSuspect: r.is_suspect,
    path: r.path,
    xValues: r.x_values,
    yValues: r.y_values,
    yDomain: [r.y_domain_min, r.y_domain_max],
    revealFromIndex: r.reveal_from_index,
  }));
}

// ---------------------------------------------------------------------------
// admin export
// ---------------------------------------------------------------------------

export type ExportRow = {
  guessId: number;
  createdAt: string;
  isRegistered: boolean;
  score: number;
  meanAbsError: number;
  meanSignedError: number;
  drawMs: number;
  redrawCount: number;
  viewportW: number | null;
  country: string | null;
  deviceType: string | null;
  city: string | null;
  state: string | null;
  birthYear: number | null;
  isSuspect: boolean;
  suspectReasons: string[];
  path: number[];
};

/**
 * Every stored response for one dataset, for download.
 *
 * "Admins should be able to download the structured data of user replies for
 * every question" (2026-08-27). This is the project's actual deliverable
 * leaving the building, so two things are deliberate:
 *
 *  - The full 40-point path is included, not just the score. The path IS the
 *    dataset; a score is a lossy summary of it.
 *  - NO email, NO display name, NO user id, and no session id. Demographics
 *    come through as coarse fields (city/state/birth year/country) because
 *    those are what a finding gets segmented by, but nothing here identifies
 *    a person or lets two exported rows be linked back to one account. An
 *    export is the easiest place for a no-PII promise to quietly break, so
 *    the identifiers are dropped in the query rather than filtered later.
 *
 * Suspect rows ARE included, flagged, rather than silently dropped - an
 * analyst needs to see what was excluded and why, and docs/DESIGN.md's rule is
 * that flagged rows are excluded from published aggregates, not hidden from
 * the person doing the aggregating.
 */
export async function exportGuessesForDataset(slug: string): Promise<ExportRow[] | null> {
  const datasetRows = await sql()<{ id: number }[]>`
    select id from datasets where slug = ${slug}
  `;
  const datasetId = datasetRows[0]?.id;
  if (datasetId === undefined) return null;

  const rows = await sql()`
    select
      g.id, g.created_at, g.score, g.mean_abs_error, g.mean_signed_error,
      g.draw_ms, g.redraw_count, g.viewport_w, g.is_suspect, g.suspect_reasons,
      g.path, (g.user_id is not null) as is_registered,
      s.country, s.device_type,
      u.city, u.state, u.birth_year
    from guesses g
    left join sessions s on s.id = g.session_id
    left join users u on u.id = g.user_id
    where g.dataset_id = ${datasetId}
    order by g.created_at asc
  `;

  return rows.map((r) => ({
    guessId: Number(r.id),
    createdAt: toIso(r.created_at),
    isRegistered: r.is_registered,
    score: r.score,
    meanAbsError: Number(r.mean_abs_error),
    meanSignedError: Number(r.mean_signed_error),
    drawMs: r.draw_ms,
    redrawCount: r.redraw_count,
    viewportW: r.viewport_w,
    country: r.country,
    deviceType: r.device_type,
    city: r.city,
    state: r.state,
    birthYear: r.birth_year,
    isSuspect: r.is_suspect,
    suspectReasons: r.suspect_reasons ?? [],
    path: r.path,
  }));
}

/**
 * The columns a full playable `Dataset` needs, and the row-to-Dataset mapper.
 *
 * Shared by every reader that returns a whole chart rather than an aggregate.
 * Two hand-written copies of an eighteen-field mapping drift, and the field
 * that drifts silently here is `revealFromIndex` or `yDomain` - either of
 * which changes what a player is asked without changing anything visible in a
 * list view.
 *
 * A function, not a module-level constant: building the fragment calls sql(),
 * and sql() connects. At module scope that would connect at IMPORT time, which
 * is exactly what the lazy connection above exists to prevent - `next build`
 * would start requiring DATABASE_URL to compile.
 */
function datasetColumns() {
  return sql()`
    d.slug, d.title, d.question, d.y_label, d.y_unit,
    d.x_values, d.y_values, d.reveal_from_index,
    d.y_domain_min, d.y_domain_max, d.source_name, d.source_url,
    d.verified, d.verified_on, d.is_active, d.reliability, d.reliability_note,
    d.source_series_id
  `;
}

type DatasetRow = {
  slug: string;
  title: string;
  question: string;
  y_label: string;
  y_unit: string;
  x_values: string[];
  y_values: number[];
  reveal_from_index: number;
  y_domain_min: number;
  y_domain_max: number;
  source_name: string;
  source_url: string;
  verified: boolean;
  verified_on: unknown;
  is_active: boolean;
  reliability: "green" | "yellow" | "red";
  reliability_note: string | null;
  source_series_id: string | null;
};

function toDataset(row: DatasetRow): Dataset {
  const r = row;

  return {
    slug: r.slug,
    title: r.title,
    question: r.question,
    yLabel: r.y_label,
    yUnit: r.y_unit,
    xValues: r.x_values,
    yValues: r.y_values,
    revealFromIndex: r.reveal_from_index,
    yDomain: [r.y_domain_min, r.y_domain_max],
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    verified: r.verified,
    verifiedOn: toDateOnly(r.verified_on),
    isActive: r.is_active,
    reliability: r.reliability,
    reliabilityNote: r.reliability_note,
    sourceSeriesId: r.source_series_id,
  };
}

/**
 * Load specific datasets by slug, live from the database.
 *
 * Exists because the homepage's intro charts are imported by NAME from
 * lib/datasets/*.ts (the Phase 1 pattern), and those TypeScript literals
 * drift from reality: `us-gun-homicide-rate` and
 * `global-child-vaccination-rate` both still say `verified: false` in their
 * files while being verified and active in the database, because the admin
 * verify flow only ever writes to Postgres. Rendering the intro charts from
 * the modules meant the player-facing VERIFIED plaque could never appear on
 * them, and it meant the homepage could serve a chart the database had since
 * deactivated.
 *
 * Same lesson as nextChartForUser: once the app is running, `is_active` and
 * `verified` in the database are the only live truth; the TS files are the
 * seed, not the state.
 *
 * Filters to active rows, so this cannot serve an unverified chart - the
 * `datasets_active_requires_verified` constraint makes active imply
 * verified at the database level.
 *
 * Returns them in the order the caller asked for, not the order Postgres
 * happened to return: the intro charts have a deliberate first-then-second
 * sequence and a set-returning query has no obligation to preserve it.
 */
export async function activeDatasetsBySlugs(slugs: readonly string[]): Promise<Dataset[]> {
  if (slugs.length === 0) return [];

  const rows = await sql()<DatasetRow[]>`
    select ${datasetColumns()}
    from datasets d
    where d.is_active = true and d.slug = any(${slugs as string[]})
  `;

  const bySlug = new Map<string, Dataset>();
  for (const row of rows) bySlug.set(row.slug, toDataset(row));

  return slugs.map((slug) => bySlug.get(slug)).filter((d): d is Dataset => d !== undefined);
}

// ---------------------------------------------------------------------------
// admin chart preview
// ---------------------------------------------------------------------------

/**
 * One row of the admin chart picker.
 *
 * Deliberately light: no y_values, no guess aggregates beyond a single count.
 * This list covers EVERY chart including the retired archive - 585 rows today
 * - and the two expensive columns on AdminDatasetRow (a full series for the
 * sparkline, six aggregate counts per row) exist to support a review decision
 * this page is not asking anyone to make.
 */
export type AdminPlayRow = {
  slug: string;
  title: string;
  sourceName: string;
  reliability: "green" | "yellow" | "red";
  verified: boolean;
  isActive: boolean;
  inRotation: boolean;
  retiredAt: string | null;
  /** Real guesses on record, clean and flagged together. */
  guessCount: number;
};

export async function allChartsForAdminPlay(): Promise<AdminPlayRow[]> {
  const rows = await sql()`
    select d.slug, d.title, d.source_name, d.reliability,
           d.verified, d.is_active, d.in_rotation, d.retired_at,
           count(g.id)::int as guess_count
    from datasets d
    left join guesses g on g.dataset_id = d.id
    group by d.id
    order by d.title asc
  `;

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    sourceName: r.source_name,
    reliability: r.reliability,
    verified: r.verified,
    isActive: r.is_active,
    inRotation: r.in_rotation,
    retiredAt: r.retired_at ? toIso(r.retired_at) : null,
    guessCount: r.guess_count,
  }));
}

/**
 * Any chart by slug, ignoring is_active, in_rotation and retired_at.
 *
 * The ONLY unfiltered chart reader in this file, and it exists for one caller:
 * the admin preview at /admin/play/[slug], which is gated on
 * session.user.role the same way every other admin surface is. Everything a
 * player can reach goes through activeDatasetsBySlugs or nextChartForUser,
 * both of which filter.
 *
 * Reading an unverified or retired chart is not the sensitive operation -
 * RECORDING a guess against one is, and the preview never submits at all. See
 * components/AdminPreviewPlay.tsx.
 */
export async function datasetForAdminPlay(slug: string): Promise<Dataset | null> {
  const rows = await sql()<DatasetRow[]>`
    select ${datasetColumns()}
    from datasets d
    where d.slug = ${slug}
  `;

  return rows[0] ? toDataset(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// moderation
// ---------------------------------------------------------------------------

export type ModerationState = {
  blockedAt: string | null;
  blockedReason: string | null;
  flaggedAt: string | null;
  flaggedReason: string | null;
  lowEffortStrikes: number;
};

/**
 * Is this account blocked, right now, according to the database?
 *
 * Called on every guess by a signed-in player, and that frequency is the
 * point. Blocking cannot be enforced at sign-in alone: this project uses a
 * JWT session strategy, so a token minted before the block stays
 * cryptographically valid until it expires and NextAuth will keep accepting
 * it without ever consulting Postgres. Checking here is what makes a block
 * take effect immediately rather than whenever the target happens to sign
 * out.
 *
 * One indexed primary-key lookup, on a path that is already doing several
 * writes - the cost is not meaningful next to what it buys.
 */
export async function isUserBlocked(userId: string): Promise<boolean> {
  const rows = await sql()<{ blocked: boolean }[]>`
    select (blocked_at is not null) as blocked from users where id = ${userId}
  `;
  // A missing row is treated as blocked: the only way to get here with a
  // valid session and no user row is a deleted account, and accepting
  // guesses from one would fail the foreign key anyway.
  return rows[0]?.blocked ?? true;
}

/**
 * Record a junk submission and report where that leaves the account.
 *
 * Increments and reads back in ONE statement so two guesses landing together
 * cannot both read the same strike count and both decide they were the one
 * that crossed a threshold - the same reasoning recordGuess and
 * maybeAdvanceStreak already apply with their row locks.
 *
 * Auto-flags for review past FLAG_AFTER_STRIKES, and never auto-blocks.
 * Blocking someone is a judgement about a person, and this function only
 * knows about the shape of a line.
 */
export async function recordLowEffortStrike(
  userId: string,
  flagAfter: number,
): Promise<{ strikes: number; flagged: boolean }> {
  const rows = await sql()<{ low_effort_strikes: number; flagged: boolean }[]>`
    update users
    set low_effort_strikes = low_effort_strikes + 1,
        flagged_at = case
          when flagged_at is null and low_effort_strikes + 1 >= ${flagAfter}
          then now() else flagged_at end,
        flagged_reason = case
          when flagged_at is null and low_effort_strikes + 1 >= ${flagAfter}
          then 'Automatic: repeated low-effort guesses' else flagged_reason end
    where id = ${userId}
    returning low_effort_strikes, (flagged_at is not null) as flagged
  `;

  const row = rows[0];
  if (!row) return { strikes: 0, flagged: false };
  return { strikes: row.low_effort_strikes, flagged: row.flagged };
}

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  role: "user" | "admin";
  city: string | null;
  state: string | null;
  country: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  flaggedAt: string | null;
  flaggedReason: string | null;
  lowEffortStrikes: number;
  /**
   * When this address last demonstrably received mail from us (set by
   * completing a password reset). Null does NOT mean anything is wrong -
   * address confirmation was removed 2026-08-27 and gates nothing. It is a
   * diagnostic: if someone reports that a reset email never arrived, this is
   * the only evidence available about whether the address works at all.
   */
  emailVerifiedAt: string | null;
  guessCount: number;
  suspectCount: number;
};

/**
 * Every account, for the admin moderation list. Callers must already have
 * checked session.user.role === 'admin' - the same trust boundary every
 * other function in this file uses.
 *
 * Ordered so the accounts needing attention surface first: blocked, then
 * flagged, then everyone else newest-first.
 */
export async function allUsersForAdmin(): Promise<AdminUserRow[]> {
  const rows = await sql()`
    select
      u.id, u.email, u.display_name, u.created_at, u.role,
      u.city, u.state, u.country,
      u.blocked_at, u.blocked_reason, u.flagged_at, u.flagged_reason,
      u.low_effort_strikes, u.email_verified_at,
      count(g.id)::int as guess_count,
      count(g.id) filter (where g.is_suspect)::int as suspect_count
    from users u
    left join guesses g on g.user_id = u.id
    group by u.id
    order by
      (u.blocked_at is not null) desc,
      (u.flagged_at is not null) desc,
      u.created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    createdAt: toIso(r.created_at),
    role: r.role,
    city: r.city,
    state: r.state,
    country: r.country,
    blockedAt: r.blocked_at ? toIso(r.blocked_at) : null,
    blockedReason: r.blocked_reason,
    flaggedAt: r.flagged_at ? toIso(r.flagged_at) : null,
    flaggedReason: r.flagged_reason,
    lowEffortStrikes: r.low_effort_strikes,
    emailVerifiedAt: r.email_verified_at ? toIso(r.email_verified_at) : null,
    guessCount: r.guess_count,
    suspectCount: r.suspect_count,
  }));
}

/** Block or unblock an account. A reason is required to block. */
export async function setUserBlocked(
  userId: string,
  blocked: boolean,
  reason: string | null,
): Promise<boolean> {
  const rows = await sql()<{ id: string }[]>`
    update users
    set blocked_at = ${blocked ? sql()`now()` : null},
        blocked_reason = ${blocked ? reason : null}
    where id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/** Flag or clear a flag. Flagging never restricts anything on its own. */
export async function setUserFlagged(
  userId: string,
  flagged: boolean,
  reason: string | null,
): Promise<boolean> {
  const rows = await sql()<{ id: string }[]>`
    update users
    set flagged_at = ${flagged ? sql()`now()` : null},
        flagged_reason = ${flagged ? reason : null},
        low_effort_strikes = ${flagged ? sql()`low_effort_strikes` : 0}
    where id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

/**
 * One account, with its moderation state, for the admin detail view.
 *
 * A dedicated query rather than filtering allUsersForAdmin(): that one
 * aggregates guess counts across every account, and running it to look at a
 * single person would get slower with every signup for no reason.
 */
export async function adminUserById(userId: string): Promise<AdminUserRow | null> {
  const rows = await sql()`
    select
      u.id, u.email, u.display_name, u.created_at, u.role,
      u.city, u.state, u.country,
      u.blocked_at, u.blocked_reason, u.flagged_at, u.flagged_reason,
      u.low_effort_strikes, u.email_verified_at,
      count(g.id)::int as guess_count,
      count(g.id) filter (where g.is_suspect)::int as suspect_count
    from users u
    left join guesses g on g.user_id = u.id
    where u.id = ${userId}
    group by u.id
  `;

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    createdAt: toIso(r.created_at),
    role: r.role,
    city: r.city,
    state: r.state,
    country: r.country,
    blockedAt: r.blocked_at ? toIso(r.blocked_at) : null,
    blockedReason: r.blocked_reason,
    flaggedAt: r.flagged_at ? toIso(r.flagged_at) : null,
    flaggedReason: r.flagged_reason,
    lowEffortStrikes: r.low_effort_strikes,
    emailVerifiedAt: r.email_verified_at ? toIso(r.email_verified_at) : null,
    guessCount: r.guess_count,
    suspectCount: r.suspect_count,
  };
}

/**
 * Verify and activate every green dataset in one action.
 *
 * 331 charts were imported at once, and clicking through them individually
 * would be absurd - but simply auto-activating them at import time would be
 * worse, because `verified` means a HUMAN decided, and a script cannot make
 * that decision on a human's behalf.
 *
 * So this is the compromise: the admin makes ONE deliberate, recorded
 * decision covering everything that already clears the green bar. Green is
 * not a small claim - it means the values are the source's own, fetched
 * reproducibly from a named indicator, with no interpolation - so an admin
 * approving that class in bulk is approving something specific rather than
 * waving through whatever happens to be in the table.
 *
 * Scoped to green ONLY. Yellow carries a caveat that deserves reading, and
 * red is not publishable at all; the database's
 * datasets_active_requires_verified constraint backs this up regardless.
 */
/**
 * Take a chart out of circulation, or put it back.
 *
 * Requested 2026-08-27: "give admins a right to delete or as you call it
 * deactivate the charts".
 *
 * Retiring sets is_active = false in the SAME statement, because the
 * datasets_retired_not_active constraint would reject any other combination -
 * a retired-but-active row is not a state this schema permits, and doing it
 * in two statements would just be a way to fail halfway.
 *
 * `retired_reason = 'admin'` is what makes the decision durable. The seed
 * clears only its own 'catalogue' retirements, so re-running the import can
 * never quietly put an admin-retired chart back in front of players.
 *
 * NOT A DELETE, despite the word in the request. Every guess against this
 * chart is kept: they are the research output, and withdrawing a chart is not
 * a reason to destroy the answers people gave it. Restoring returns the chart
 * to an inactive-but-eligible state rather than straight to live, so putting
 * something back in front of players stays a deliberate second action.
 */
export async function setDatasetRetired(
  slug: string,
  retired: boolean,
): Promise<{ slug: string; retiredAt: string | null } | null> {
  const rows = await sql()<{ slug: string; retired_at: string | null }[]>`
    update datasets set
      retired_at = ${retired ? sql()`now()` : null},
      retired_reason = ${retired ? "admin" : null},
      is_active = case when ${retired} then false else is_active end
    where slug = ${slug}
    returning slug, retired_at
  `;

  const row = rows[0];
  if (!row) return null;
  return { slug: row.slug, retiredAt: row.retired_at ? toIso(row.retired_at) : null };
}

/**
 * How many active charts the queue is currently allowed to hand out.
 *
 * Separate from "how many are active": a held-back chart is still live in
 * every other sense. See the rotation migration for why these are different
 * things.
 */
export async function rotationCounts(): Promise<{ inRotation: number; heldBack: number }> {
  const rows = await sql()<{ in_rotation: number; held_back: number }[]>`
    select count(*) filter (where is_active and in_rotation)::int as in_rotation,
           count(*) filter (where is_active and not in_rotation)::int as held_back
    from datasets
  `;
  return { inRotation: rows[0]?.in_rotation ?? 0, heldBack: rows[0]?.held_back ?? 0 };
}

/**
 * Put every active chart back in the queue.
 *
 * The whole reason rotation is a separate column: this is one UPDATE and it is
 * instant, with nothing to re-verify, re-import or re-activate afterwards.
 */
export async function restoreFullRotation(): Promise<{ restored: number }> {
  const rows = await sql()`
    update datasets set in_rotation = true
    where is_active and not in_rotation
    returning slug
  `;
  return { restored: rows.length };
}

export async function activateGreenDatasets(): Promise<{ activated: number }> {
  const rows = await sql()<{ slug: string }[]>`
    update datasets
    set verified = true,
        verified_on = current_date,
        is_active = true,
        published_at = coalesce(published_at, now())
    where reliability = 'green'
      and source_series_id is not null
      and is_active = false
      /*
       * Never resurrect a withdrawn chart. Without this the 2026-08-27
       * catalogue rewrite put 564 charts live instead of 275: the seed
       * retired 289 dropped slugs, and this statement immediately
       * reactivated every one of them, because "green, imported, inactive"
       * describes a retired chart exactly as well as a pending one.
       * retired_at is what tells the two apart.
       */
      and retired_at is null
    returning slug
  `;
  return { activated: rows.length };
}

/** Undo the above - deactivate every imported chart, leaving curated ones alone. */
export async function deactivateImportedDatasets(): Promise<{ deactivated: number }> {
  const rows = await sql()<{ slug: string }[]>`
    update datasets
    set is_active = false
    where source_series_id is not null and is_active = true
    returning slug
  `;
  return { deactivated: rows.length };
}
