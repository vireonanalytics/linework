-- 08_data_quality.sql
--
-- How much of the collected data is worth anything, and why the rest was
-- excluded.
--
-- ---------------------------------------------------------------------------
-- THE FOUR SUSPECT RULES
-- ---------------------------------------------------------------------------
-- Set at write time in lib/server/suspect.ts, stored in
-- guesses.suspect_reasons, and excluded from every published aggregate:
--
--   zero-variance         the drawn path is perfectly flat, every point equal
--   too-fast              draw_ms < 300
--   duplicate-in-session  this session already answered this chart
--   headless-agent        the user agent matched a known automation signature
--
-- Reasons ACCUMULATE rather than short-circuit: a row guilty of three is
-- recorded as guilty of three, so the flag can be audited later rather than
-- just trusted. A database CHECK keeps is_suspect and suspect_reasons in
-- agreement, so a flagged row can never have no stated reason.
--
-- ---------------------------------------------------------------------------
-- WHAT TO WATCH FOR
-- ---------------------------------------------------------------------------
-- A flag rate creeping up is the early warning that this project is being
-- scraped or botted. A flag rate near zero once real traffic arrives is
-- suspicious in the other direction: it probably means detection is failing,
-- not that every visitor is sincere.


-- ---------------------------------------------------------------------------
-- 1. Flag rate overall
-- ---------------------------------------------------------------------------
select
  count(*)                                                            as responses_total,
  count(*) filter (where is_suspect)                                  as flagged,
  round(100.0 * count(*) filter (where is_suspect) / nullif(count(*), 0), 2)
                                                                      as pct_flagged,
  count(distinct session_id)                                          as sessions,
  count(distinct session_id) filter (where is_suspect)                as sessions_with_a_flag
from guesses;


-- ---------------------------------------------------------------------------
-- 2. Which reasons fire, and how often
--
-- Unnests the array, so a row flagged for two reasons is counted under both.
-- The counts therefore sum to MORE than the flagged row count, which is
-- correct and is the point.
-- ---------------------------------------------------------------------------
select
  reason,
  count(*)                                                            as occurrences,
  count(distinct g.id)                                                as distinct_rows,
  count(distinct g.session_id)                                        as distinct_sessions,
  min(g.created_at)                                                   as first_seen,
  max(g.created_at)                                                   as last_seen
from guesses g
cross join lateral unnest(g.suspect_reasons) as reason
group by reason
order by occurrences desc;


-- ---------------------------------------------------------------------------
-- 3. How many reasons per flagged row
--
-- A row flagged for three reasons is a much stronger signal than a row
-- flagged for one. A large bucket at exactly 1 reason, all from the same rule,
-- is worth inspecting: it may mean that rule is over-firing on real people.
-- ---------------------------------------------------------------------------
select
  array_length(suspect_reasons, 1)                                    as reason_count,
  count(*)                                                            as rows,
  round(100.0 * count(*) / sum(count(*)) over (), 1)                  as pct_of_flagged,
  array_agg(distinct suspect_reasons::text order by suspect_reasons::text)
    filter (where array_length(suspect_reasons, 1) is not null)        as example_combinations
from guesses
where is_suspect
group by array_length(suspect_reasons, 1)
order by reason_count;


-- ---------------------------------------------------------------------------
-- 4. Flag rate over time
--
-- The line to watch after any traffic spike. A post that brings real readers
-- should not move this much; a post that attracts scripts will.
-- ---------------------------------------------------------------------------
select
  created_at::date                                                    as day_utc,
  count(*)                                                            as responses,
  count(*) filter (where is_suspect)                                  as flagged,
  round(100.0 * count(*) filter (where is_suspect) / nullif(count(*), 0), 1)
                                                                      as pct_flagged,
  count(distinct session_id)                                          as sessions
from guesses
group by created_at::date
order by day_utc;


-- ---------------------------------------------------------------------------
-- 5. Flag rate by traffic source and device
--
-- Where the junk comes from. A referrer with a high flag rate is worth
-- knowing about before deciding to advertise there again.
-- ---------------------------------------------------------------------------
select
  coalesce(s.referrer_host, '(direct or unknown)')                    as referrer_host,
  coalesce(s.device_type, 'unknown')                                  as device_type,
  count(*)                                                            as responses,
  count(*) filter (where g.is_suspect)                                as flagged,
  round(100.0 * count(*) filter (where g.is_suspect) / nullif(count(*), 0), 1)
                                                                      as pct_flagged
from guesses g
join sessions s on s.id = g.session_id
group by coalesce(s.referrer_host, '(direct or unknown)'),
         coalesce(s.device_type, 'unknown')
order by responses desc;


-- ---------------------------------------------------------------------------
-- 6. Per-chart contamination
--
-- The number that decides whether a chart's aggregate is publishable. A chart
-- whose clean count clears 50 but whose flagged share is a third of its
-- traffic deserves a look before anything is claimed about it.
-- ---------------------------------------------------------------------------
select
  d.slug,
  count(*)                                                            as responses,
  count(*) filter (where not g.is_suspect)                            as clean,
  count(*) filter (where g.is_suspect)                                as flagged,
  round(100.0 * count(*) filter (where g.is_suspect) / nullif(count(*), 0), 1)
                                                                      as pct_flagged,
  count(*) filter (where not g.is_suspect) >= 50                      as meets_crowd_threshold
from guesses g
join datasets d on d.id = g.dataset_id
group by d.id, d.slug
having count(*) filter (where g.is_suspect) > 0
order by pct_flagged desc, responses desc;


-- ---------------------------------------------------------------------------
-- 7. Low-effort strikes on accounts
--
-- A separate and stricter mechanism from suspect flagging, in
-- lib/server/low-effort.ts. It judges the SHAPE of a line only, never its
-- accuracy: being wrong is the entire point of this dataset, and a confidently
-- wrong line is the most valuable row in the table, so penalising wrongness
-- would destroy the signal and teach people to draw what they think is
-- expected.
--
-- It never auto-blocks. Blocking is a judgement about a person; this code only
-- knows about the shape of a line.
-- ---------------------------------------------------------------------------
select
  count(*)                                                            as users,
  count(*) filter (where low_effort_strikes > 0)                      as users_with_strikes,
  count(*) filter (where low_effort_strikes >= 4)                     as users_auto_flagged,
  count(*) filter (where flagged_at is not null)                      as users_flagged_for_review,
  count(*) filter (where blocked_at is not null)                      as users_blocked,
  max(low_effort_strikes)                                             as max_strikes
from users;
