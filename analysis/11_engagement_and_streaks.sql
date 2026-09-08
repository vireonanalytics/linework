-- 11_engagement_and_streaks.sql
--
-- Whether the retention mechanic does anything.
--
-- ---------------------------------------------------------------------------
-- HOW STREAKS WORK HERE
-- ---------------------------------------------------------------------------
-- A day qualifies when a user answers 3 distinct charts in one UTC day
-- (maybeAdvanceStreak in lib/server/db.ts). One missed day with a banked
-- freeze auto-consumes the freeze and the streak continues; two or more days
-- missed resets regardless. A freeze is earned at every 7-day milestone,
-- capped at 3.
--
-- ---------------------------------------------------------------------------
-- WHY SECTION 4 EXISTS
-- ---------------------------------------------------------------------------
-- The streak columns on `users` are DERIVED STATE, maintained incrementally by
-- application code. Twice already they have been wrong while the underlying
-- guesses were fine: once because the advance was fired without await and a
-- serverless instance froze before it ran, and once because String() on a DATE
-- column produced "Thu Aug 27" instead of "2026-08-27", so the guard never
-- matched and the streak reset on every single guess.
--
-- Both times the fix started with rebuilding streaks from `guesses`, which is
-- the only record that was never lossy. Section 4 recomputes qualifying days
-- from scratch so the stored value can be checked rather than trusted.


-- ---------------------------------------------------------------------------
-- 1. Streak state across all accounts
-- ---------------------------------------------------------------------------
select
  count(*)                                                            as users,
  count(*) filter (where current_streak > 0)                          as with_live_streak,
  count(*) filter (where longest_streak > 0)                          as ever_had_a_streak,
  count(*) filter (where longest_streak >= 7)                         as reached_a_week,
  round(avg(current_streak)::numeric, 2)                              as mean_current,
  max(current_streak)                                                 as max_current,
  round(avg(longest_streak)::numeric, 2)                              as mean_longest,
  max(longest_streak)                                                 as max_longest,
  sum(streak_freezes_available)                                       as freezes_banked,
  count(*) filter (where last_active_date = (now() at time zone 'UTC')::date)
                                                                      as qualified_today
from users;


-- ---------------------------------------------------------------------------
-- 2. Does a live streak change behaviour?
--
-- The question the mechanic exists to answer. Correlational and probably
-- reversed: people with streaks are people who were already engaged, so a
-- difference here is not evidence the streak CAUSED anything.
-- ---------------------------------------------------------------------------
select
  case
    when u.current_streak = 0 then 'a. no streak'
    when u.current_streak < 3 then 'b. 1 to 2 days'
    when u.current_streak < 7 then 'c. 3 to 6 days'
    else                           'd. 7+ days'
  end                                                                 as streak_band,
  count(distinct u.id)                                                as users,
  count(g.id)                                                         as responses,
  round(avg(g.mean_abs_error)::numeric, 4)                            as mean_abs_err,
  round(avg(g.score)::numeric, 1)                                     as mean_score,
  round(avg(g.draw_ms)::numeric, 0)                                   as mean_draw_ms,
  round(avg(g.redraw_count)::numeric, 2)                              as mean_redraws
from users u
left join guesses g on g.user_id = u.id and not g.is_suspect
group by streak_band
order by streak_band;


-- ---------------------------------------------------------------------------
-- 3. Daily goal completion
--
-- Of the days someone showed up at all, how often did they reach 3 charts?
-- A low share means the goal is set too high for how people actually play.
-- ---------------------------------------------------------------------------
with user_days as (
  select
    g.user_id,
    g.created_at::date                                                as day_utc,
    count(distinct g.dataset_id)                                      as distinct_charts
  from guesses g
  where g.user_id is not null and not g.is_suspect
  group by g.user_id, g.created_at::date
)
select
  count(*)                                                            as user_days_active,
  count(*) filter (where distinct_charts >= 3)                        as user_days_qualifying,
  round(100.0 * count(*) filter (where distinct_charts >= 3) / nullif(count(*), 0), 1)
                                                                      as pct_days_qualifying,
  round(avg(distinct_charts)::numeric, 2)                             as mean_charts_per_active_day,
  count(*) filter (where distinct_charts = 1)                         as days_with_exactly_one,
  count(*) filter (where distinct_charts = 2)                         as days_with_exactly_two
from user_days;


-- ---------------------------------------------------------------------------
-- 4. Audit: recompute streaks from the guesses themselves
--
-- Rebuilds each user's qualifying days from raw responses and compares the
-- resulting current streak against the stored column. Any row returned is a
-- disagreement worth investigating; an empty result is the clean case.
--
-- Note this recomputes the streak WITHOUT freeze consumption, because freezes
-- are spent at write time and leave no record of when they were used. So a
-- user who legitimately consumed a freeze will show a stored streak HIGHER
-- than the recomputed one. That is expected, and it is why the output names
-- both numbers instead of asserting one is right.
-- ---------------------------------------------------------------------------
with qualifying_days as (
  select
    g.user_id,
    g.created_at::date                                                as day_utc
  from guesses g
  where g.user_id is not null and not g.is_suspect
  group by g.user_id, g.created_at::date
  having count(distinct g.dataset_id) >= 3
),
-- Consecutive runs: subtracting a dense row number from the date makes every
-- run of consecutive days share one anchor value, so runs can be grouped.
runs as (
  select
    user_id,
    day_utc,
    day_utc - (row_number() over (partition by user_id order by day_utc))::int as run_anchor
  from qualifying_days
),
run_lengths as (
  select
    user_id,
    run_anchor,
    count(*)                                                          as run_length,
    max(day_utc)                                                      as run_ended
  from runs
  group by user_id, run_anchor
),
recomputed as (
  select
    user_id,
    max(run_length)                                                   as longest_recomputed,
    -- The current streak is only the most recent run, and only if it is still
    -- live: it must have reached today or yesterday in UTC.
    coalesce(max(run_length) filter (
      where run_ended >= (now() at time zone 'UTC')::date - 1
    ), 0)                                                             as current_recomputed
  from run_lengths
  group by user_id
)
select
  u.email,
  u.current_streak                                                    as current_stored,
  coalesce(r.current_recomputed, 0)                                   as current_recomputed,
  u.longest_streak                                                    as longest_stored,
  coalesce(r.longest_recomputed, 0)                                   as longest_recomputed,
  u.streak_freezes_available                                          as freezes_banked,
  u.last_active_date,
  case
    when u.current_streak > coalesce(r.current_recomputed, 0)
      then 'stored is higher - a consumed freeze would explain this'
    when u.current_streak < coalesce(r.current_recomputed, 0)
      then 'stored is LOWER - investigate, this is the failure mode seen before'
    else 'longest disagrees only'
  end                                                                 as note
from users u
left join recomputed r on r.user_id = u.id
where u.current_streak <> coalesce(r.current_recomputed, 0)
   or u.longest_streak <> coalesce(r.longest_recomputed, 0)
order by u.email;


-- ---------------------------------------------------------------------------
-- 5. Per-user activity, most active first
--
-- Emails are included because this is an operator query run by the person who
-- owns the database, not an export. Nothing in analysis/ is safe to publish
-- as-is; the export route (/api/admin/datasets/[slug]/export) is the path that
-- deliberately drops every identifier.
-- ---------------------------------------------------------------------------
select
  u.email,
  u.display_name,
  u.created_at::date                                                  as joined,
  count(g.id)                                                         as responses,
  count(g.id) filter (where g.is_suspect)                             as flagged,
  count(distinct g.created_at::date)                                  as active_days,
  count(distinct g.session_id)                                        as sessions,
  u.current_streak,
  u.longest_streak,
  u.low_effort_strikes,
  round(avg(g.mean_abs_error) filter (where not g.is_suspect)::numeric, 4) as mean_abs_err,
  max(g.created_at)                                                   as last_seen
from users u
left join guesses g on g.user_id = u.id
group by u.id, u.email, u.display_name, u.created_at, u.current_streak,
         u.longest_streak, u.low_effort_strikes
order by responses desc, u.created_at;
