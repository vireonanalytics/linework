-- 04_funnel.sql
--
-- Where people stop.
--
-- ---------------------------------------------------------------------------
-- WHAT "COMPLETION" MEANS HERE, AND WHAT IT CANNOT MEAN
-- ---------------------------------------------------------------------------
-- This product has no fixed-length run. There is no "5 questions and you are
-- done" to complete: a signed-in player is served charts one at a time,
-- forever, until they stop (nextChartForUser). So there is no completion RATE
-- in the usual sense, and any query claiming one would be inventing a
-- denominator.
--
-- What exists instead, and what this file measures, is step-to-step
-- persistence: of the people who answered their Nth chart, how many came back
-- for an (N+1)th. That is the real funnel and it needs no invented total.
--
-- A second, harder limit: this table only records people who FINISHED a
-- drawing and pressed Reveal. Someone who loaded the page, looked at the
-- chart and left never appears in `guesses` at all. So the drop-off measured
-- here starts at step 1 and is blind to everything before it. Page-level
-- drop-off would have to come from Vercel Analytics, not from this database.
--
-- Two different units of persistence are measured, because they answer
-- different questions:
--   Sections 1-2  by SESSION      - persistence within one sitting
--   Section 4     by USER         - persistence across days, i.e. retention


-- ---------------------------------------------------------------------------
-- 1. Step-to-step persistence within a session
--
-- The window function is doing the real work: `lead()` over the ordered step
-- counts gives each step the count of the step after it, so the conversion is
-- a straight division on one row rather than a self-join.
--
-- ---------------------------------------------------------------------------
-- WHY THE STEP IS RECOMPUTED INSTEAD OF READING order_in_session
-- ---------------------------------------------------------------------------
-- guesses.order_in_session is assigned at write time and never renumbered, so
-- it is NOT dense. Any row that was later deleted leaves a permanent hole, and
-- filtering out flagged rows opens more. Production already contains a session
-- with 28 rows spanning positions 1 to 33.
--
-- Counting sessions per stored position therefore produces a funnel that can
-- go UP: a hole at position 11 makes step 11 look smaller than step 12, which
-- came out as "150% continued" the first time this query was run. A funnel
-- that rises is always a bug, never a finding.
--
-- Recomputing the step with row_number() over the surviving rows makes the
-- funnel monotonic by construction: "sessions reaching step N" becomes
-- "sessions with at least N clean responses", which cannot increase.
-- ---------------------------------------------------------------------------
with sequenced as (
  select
    g.session_id,
    row_number() over (
      partition by g.session_id order by g.order_in_session, g.id
    )                                         as step
  from guesses g
  where not g.is_suspect
),
step_counts as (
  select
    step,
    count(distinct session_id)                as sessions_reaching_step
  from sequenced
  group by step
),
with_next as (
  select
    step,
    sessions_reaching_step,
    lead(sessions_reaching_step) over (order by step)  as sessions_reaching_next,
    first_value(sessions_reaching_step) over (order by step) as sessions_at_step_1
  from step_counts
)
select
  step,
  sessions_reaching_step,
  sessions_reaching_next,
  -- Of everyone who got this far, what share took one more step.
  round(
    100.0 * sessions_reaching_next / nullif(sessions_reaching_step, 0), 1
  )                                           as pct_continue_to_next,
  -- And the complement, which is the number people actually want to see.
  round(
    100.0 * (sessions_reaching_step - coalesce(sessions_reaching_next, 0))
      / nullif(sessions_reaching_step, 0), 1
  )                                           as pct_drop_off_here,
  -- Cumulative survival from step 1, so the shape of the whole funnel is
  -- readable down one column.
  round(
    100.0 * sessions_reaching_step / nullif(sessions_at_step_1, 0), 1
  )                                           as pct_of_step_1_surviving
from with_next
order by step;


-- ---------------------------------------------------------------------------
-- 2. How long a sitting runs
--
-- The distribution behind section 1. A mean of "3.2 charts per session" can
-- come from everyone doing three, or from most people doing one and a few
-- doing thirty, and those call for completely different product decisions.
-- ---------------------------------------------------------------------------
with per_session as (
  select
    g.session_id,
    count(*)                                  as charts_answered,
    max(g.order_in_session)                   as furthest_step,
    min(g.created_at)                         as started_at,
    max(g.created_at)                         as ended_at
  from guesses g
  where not g.is_suspect
  group by g.session_id
)
select
  charts_answered,
  count(*)                                    as sessions,
  round(100.0 * count(*) / sum(count(*)) over (), 1)  as pct_of_sessions,
  round(
    100.0 * sum(count(*)) over (order by charts_answered desc)
      / sum(count(*)) over (), 1
  )                                           as pct_reaching_at_least_this_many
from per_session
group by charts_answered
order by charts_answered;


-- ---------------------------------------------------------------------------
-- 3. Does drop-off follow a hard question?
--
-- The product question behind the funnel: do people leave because they are
-- bored, or because a specific chart defeated them? For every response that
-- turned out to be the LAST of its session, this compares that chart's
-- difficulty against its own average.
--
-- A chart appearing high here with a high `n_last` is a candidate exit point.
-- Note this is correlational and the sample is per-chart, so it needs real
-- volume before it means anything.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    g.*,
    row_number() over (partition by g.session_id order by g.order_in_session desc) as from_end
  from guesses g
  where not g.is_suspect
)
select
  d.slug,
  d.title,
  count(*)                                                    as n_total,
  count(*) filter (where r.from_end = 1)                      as n_last_in_session,
  round(
    100.0 * count(*) filter (where r.from_end = 1) / nullif(count(*), 0), 1
  )                                                           as pct_ended_session,
  round(avg(r.mean_abs_error)::numeric, 4)                    as mean_abs_err,
  round(avg(r.draw_ms)::numeric, 0)                           as mean_draw_ms
from ranked r
join datasets d on d.id = r.dataset_id
group by d.id, d.slug, d.title
having count(*) >= 3
order by pct_ended_session desc, n_total desc;


-- ---------------------------------------------------------------------------
-- 4. Retention: do registered players come back on a later day?
--
-- Sessions are per-visit, so session-level persistence says nothing about
-- whether anyone returned. Only user_id survives across visits, so this is
-- necessarily registered players only.
-- ---------------------------------------------------------------------------
with user_days as (
  select
    g.user_id,
    g.created_at::date                        as day_utc,
    count(*)                                  as responses
  from guesses g
  where g.user_id is not null and not g.is_suspect
  group by g.user_id, g.created_at::date
),
sequenced as (
  select
    user_id,
    day_utc,
    responses,
    row_number() over (partition by user_id order by day_utc)  as day_number,
    min(day_utc)  over (partition by user_id)                  as first_day,
    lead(day_utc) over (partition by user_id order by day_utc)  as next_day
  from user_days
)
select
  day_number,
  count(distinct user_id)                     as users_active_on_nth_day,
  sum(responses)                              as responses,
  round(avg(responses)::numeric, 1)           as mean_responses_per_active_day,
  -- Gap to the next visit, in days. 1 means consecutive days.
  round(avg(next_day - day_utc)::numeric, 1)  as mean_days_to_next_visit
from sequenced
group by day_number
order by day_number;
