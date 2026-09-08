-- 13_integrity_checks.sql
--
-- Assertions, not analysis. Every query here should return ZERO ROWS.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- The database already enforces a great deal through CHECK constraints, and
-- those cover the things a constraint can express: a path is exactly its
-- declared resolution, every value is in 0..1000, an active dataset must be
-- verified, is_suspect must agree with suspect_reasons.
--
-- What a constraint cannot express is agreement between two implementations of
-- the same definition written in different languages. The scoring maths lives
-- in TypeScript (lib/scoring/score.ts) and is reproduced in SQL in
-- 07_shape_of_error.sql. Nothing automatically checks that those two agree.
-- Section 1 is that check.
--
-- Run this file after changing the scoring code, the resampling code, or
-- either SQL copy of the truth CTE. A non-empty result means a published
-- number would be wrong, which for this project is the worst class of bug:
-- silent, plausible, and downstream of everything.


-- ---------------------------------------------------------------------------
-- 1. Does the stored score match a recomputation from the raw path?
--
-- The important one. Recomputes mean_abs_error and mean_signed_error from
-- guesses.path and the dataset's own series, using the same resampling the
-- server used, and compares against what was stored at write time.
--
-- Tolerance is 1e-9, which is floating-point noise. Anything larger means the
-- two implementations have genuinely diverged.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
with truth as (
  select
    d.id                                                              as dataset_id,
    i.i                                                               as x_index,
    (
      (
        (d.y_values ->> floor(pos.position)::int)::double precision
        + (pos.position - floor(pos.position))
          * (
              (d.y_values ->> least(
                 floor(pos.position)::int + 1,
                 jsonb_array_length(d.y_values) - 1
               ))::double precision
              - (d.y_values ->> floor(pos.position)::int)::double precision
            )
      ) - d.y_domain_min
    ) / (d.y_domain_max - d.y_domain_min)                             as truth_unit
  from datasets d
  cross join generate_series(0, 39) as i(i)
  cross join lateral (
    select d.reveal_from_index
         + ((jsonb_array_length(d.y_values) - 1 - d.reveal_from_index)::double precision * i.i)
           / 39.0                                                     as position
  ) pos
),
recomputed as (
  select
    g.id                                                              as guess_id,
    avg(abs(p.val / 1000.0 - t.truth_unit))                           as abs_err,
    avg(p.val / 1000.0 - t.truth_unit)                                as signed_err
  from guesses g
  cross join lateral unnest(g.path) with ordinality as p(val, ord)
  join truth t on t.dataset_id = g.dataset_id and t.x_index = p.ord - 1
  where g.path_resolution = 40
  group by g.id
)
select
  g.id                                                                as guess_id,
  d.slug,
  g.mean_abs_error                                                    as stored_abs_err,
  round(r.abs_err::numeric, 10)                                       as recomputed_abs_err,
  round((g.mean_abs_error - r.abs_err)::numeric, 12)                  as abs_err_drift,
  g.mean_signed_error                                                 as stored_signed_err,
  round(r.signed_err::numeric, 10)                                    as recomputed_signed_err,
  round((g.mean_signed_error - r.signed_err)::numeric, 12)            as signed_err_drift,
  g.score                                                             as stored_score,
  round(100 * exp(-4 * r.abs_err))::int                               as recomputed_score
from guesses g
join recomputed r on r.guess_id = g.id
join datasets d on d.id = g.dataset_id
where abs(g.mean_abs_error - r.abs_err) > 1e-9
   or abs(g.mean_signed_error - r.signed_err) > 1e-9
   or g.score <> round(100 * exp(-4 * r.abs_err))::int
order by abs(g.mean_abs_error - r.abs_err) desc;


-- ---------------------------------------------------------------------------
-- 2. Does the stored score match its own stored error?
--
-- Weaker than section 1 and much cheaper: it never touches the path or the
-- series, only checks that score = round(100 * exp(-4 * mean_abs_error)).
-- Catches a corrupted or hand-edited score column.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select
  id, dataset_id, score, mean_abs_error,
  round(100 * exp(-4 * mean_abs_error))::int                          as score_should_be
from guesses
where score <> round(100 * exp(-4 * mean_abs_error))::int;


-- ---------------------------------------------------------------------------
-- 3. Signed error must never exceed absolute error
--
-- True by definition: |mean(x)| <= mean(|x|). A violation means one of the two
-- was written independently of the other, which would mean the write path is
-- not computing them from the same array.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select id, dataset_id, mean_abs_error, mean_signed_error
from guesses
where abs(mean_signed_error) > mean_abs_error + 1e-12;


-- ---------------------------------------------------------------------------
-- 4. Path resolution assumptions
--
-- Several queries in this directory hard-code 40 points. This asserts that
-- assumption against the data instead of trusting it.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select id, dataset_id, path_resolution, array_length(path, 1) as actual_length
from guesses
where path_resolution <> 40 or array_length(path, 1) <> 40;


-- ---------------------------------------------------------------------------
-- 5. The no-PII guarantee, checked rather than assumed
--
-- sessions must never contain anything identifying. country is ISO-2 only,
-- referrer_host is a hostname with no path or query string, ua_hash is a
-- salted hash and never a raw user agent.
--
-- These patterns catch the ways that promise would break in practice: an IP
-- address in a country column, a URL path or query string surviving into
-- referrer_host, a user agent stored raw because the hashing was skipped.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select id, country, device_type, referrer_host, 'suspicious session row' as why
from sessions
where country ~ '[0-9]'                              -- an IP would have digits
   or referrer_host ~ '[/?#]'                        -- path, query or fragment survived
   or referrer_host ~ '^https?:'                     -- a full URL, not a host
   or length(coalesce(ua_hash, '')) between 1 and 31 -- too short to be a sha-256 hex digest
   or ua_hash ~ 'Mozilla|Chrome|Safari|Gecko';       -- a raw user agent


-- ---------------------------------------------------------------------------
-- 6. Anonymity of the anonymous pipeline
--
-- guesses.session_id is NOT NULL by constraint, so the anonymous identity is
-- always present. guesses.user_id is additional and nullable, never a
-- replacement. This asserts the relationship holds and that no guess points at
-- a session that no longer exists.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select g.id, g.session_id, g.user_id, 'orphaned or malformed identity' as why
from guesses g
left join sessions s on s.id = g.session_id
where s.id is null;


-- ---------------------------------------------------------------------------
-- 7. Would any unverified or retired chart be served?
--
-- Both are enforced by CHECK constraints
-- (datasets_active_requires_verified, datasets_retired_not_active), so this
-- can only fail if a constraint were dropped. Cheap to run, and the failure it
-- catches is the one that breaks the project's central promise: unverified
-- data must never reach production.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select slug, verified, is_active, in_rotation, retired_at, retired_reason, reliability
from datasets
where (is_active and not verified)
   or (retired_at is not null and is_active)
   or (retired_at is null) <> (retired_reason is null)
   or (in_rotation and not is_active and retired_at is null);


-- ---------------------------------------------------------------------------
-- 8. Red charts must never be in circulation
--
-- Not a database constraint, a policy: red means approximated or unconfirmed
-- and not publishable. Serving one would put numbers in front of players that
-- this project has explicitly said it does not stand behind.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select slug, reliability, reliability_note, is_active, in_rotation
from datasets
where reliability = 'red' and is_active;


-- ---------------------------------------------------------------------------
-- 9. Duplicate questions
--
-- The identity of a chart is the SERIES it plots, not its slug. Deduplicating
-- on slug once let the same World Bank indicator ship under two names, which
-- meant a player could be served the identical question twice and that
-- question's answers split across two rows so neither aggregate reached the
-- crowd threshold when their sum would have.
--
-- Checked on three axes because a duplicate can hide from any one of them.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select 'duplicate source_series_id' as axis, source_series_id as value,
       count(*) as charts, string_agg(slug, ', ' order by slug) as slugs
from datasets
where source_series_id is not null and retired_at is null
group by source_series_id having count(*) > 1
union all
select 'duplicate title', title, count(*), string_agg(slug, ', ' order by slug)
from datasets
where retired_at is null
group by title having count(*) > 1
union all
select 'identical series data', md5(y_values::text || x_values::text), count(*),
       string_agg(slug, ', ' order by slug)
from datasets
where retired_at is null
group by md5(y_values::text || x_values::text) having count(*) > 1;


-- ---------------------------------------------------------------------------
-- 10. Crowd percentiles must be ordered
--
-- A database CHECK already enforces p10 <= p25 <= p50 <= p75 <= p90, so this
-- can only fail if that constraint were dropped. Included because a band that
-- reads backwards on screen is the visible symptom, and it is worth being able
-- to rule it out in one query.
--
-- Expected: zero rows.
-- ---------------------------------------------------------------------------
select dataset_id, x_index, n, p10, p25, p50, p75, p90
from crowd_stats
where not (p10 <= p25 and p25 <= p50 and p50 <= p75 and p75 <= p90)
   or p10 < 0 or p90 > 1000;
