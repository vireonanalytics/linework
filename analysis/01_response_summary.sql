-- 01_response_summary.sql
--
-- Sample size, stated honestly and without flattery.
--
-- Every other query in this directory is meaningless until this one shows a
-- number large enough to support it. Run this first, every time, and read the
-- result before reading anything else. A divergence figure computed over four
-- responses is not a finding, it is four people.
--
-- Convention used throughout this directory: "clean" means NOT is_suspect.
-- Flagged rows are stored but excluded from every published aggregate, which
-- is a rule the codebase has enforced since Phase 3. These queries follow it.


-- ---------------------------------------------------------------------------
-- 1. Overall totals
-- ---------------------------------------------------------------------------
select
  count(*)                                             as responses_total,
  count(*) filter (where not is_suspect)               as responses_clean,
  count(*) filter (where is_suspect)                   as responses_flagged,
  round(
    100.0 * count(*) filter (where is_suspect) / nullif(count(*), 0),
    1
  )                                                    as pct_flagged,
  count(distinct session_id)                           as sessions_distinct,
  count(distinct user_id)                              as users_distinct,
  count(*) filter (where user_id is not null)          as responses_registered,
  count(*) filter (where user_id is null)              as responses_anonymous,
  count(distinct dataset_id)                           as questions_answered,
  min(created_at)                                      as first_response_at,
  max(created_at)                                      as last_response_at,
  -- Collection window in whole days. One day of data is one day of data,
  -- however many rows it contains.
  greatest(1, (max(created_at)::date - min(created_at)::date) + 1)
                                                       as collection_days
from guesses;


-- ---------------------------------------------------------------------------
-- 2. How much of the catalogue has ever been answered
--
-- The denominator that matters. 585 charts exist; the honest question is how
-- many have enough responses to say anything about, not how many exist.
-- ---------------------------------------------------------------------------
select
  count(*)                                                       as datasets_total,
  count(*) filter (where d.is_active)                            as datasets_active,
  count(*) filter (where d.is_active and d.in_rotation)          as datasets_in_rotation,
  count(*) filter (where d.retired_at is not null)               as datasets_retired,
  count(*) filter (where a.clean_n > 0)                          as datasets_with_any_response,
  count(*) filter (where a.clean_n >= 50)                        as datasets_at_crowd_threshold,
  count(*) filter (where d.is_active and d.in_rotation and coalesce(a.clean_n, 0) = 0)
                                                                 as in_rotation_never_answered
from datasets d
left join lateral (
  select count(*) filter (where not g.is_suspect) as clean_n
  from guesses g
  where g.dataset_id = d.id
) a on true;


-- ---------------------------------------------------------------------------
-- 3. Responses per question
--
-- Ordered by volume. `crowd_gap` is how many more clean responses this chart
-- needs before the public crowd view is allowed to render for it
-- (CROWD_MIN_N = 50 in lib/crowd/constants.ts).
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  d.is_active,
  d.in_rotation,
  count(g.id)                                          as responses_total,
  count(g.id) filter (where not g.is_suspect)          as responses_clean,
  count(g.id) filter (where g.is_suspect)              as responses_flagged,
  count(distinct g.session_id)                         as sessions_distinct,
  count(distinct g.user_id)                            as users_distinct,
  greatest(0, 50 - count(g.id) filter (where not g.is_suspect)) as crowd_gap,
  min(g.created_at)                                    as first_response_at,
  max(g.created_at)                                    as last_response_at
from datasets d
join guesses g on g.dataset_id = d.id
group by d.id, d.slug, d.title, d.is_active, d.in_rotation
order by responses_clean desc, d.title asc;


-- ---------------------------------------------------------------------------
-- 4. Responses per day
--
-- Dates are UTC, matching how the rest of the app defines a day
-- (todayUtc() in lib/daily/select.ts drives the streak logic).
-- ---------------------------------------------------------------------------
select
  created_at::date                                     as day_utc,
  count(*)                                             as responses,
  count(*) filter (where not is_suspect)               as responses_clean,
  count(distinct session_id)                           as sessions,
  count(distinct user_id)                              as users,
  count(distinct dataset_id)                           as questions_touched
from guesses
group by created_at::date
order by day_utc;
