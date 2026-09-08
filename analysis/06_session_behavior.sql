-- 06_session_behavior.sql
--
-- How people actually use the thing: how long they take, how much they
-- hesitate, whether they come back.
--
-- ---------------------------------------------------------------------------
-- WHAT draw_ms AND redraw_count ACTUALLY MEASURE
-- ---------------------------------------------------------------------------
-- Both are narrower than they look, and both have been misread before.
--
-- draw_ms is the duration of the FINAL ACCEPTED STROKE only. It is not
-- time-on-question and not time-on-page. Someone who stared at a chart for two
-- minutes and then drew a confident line in 800ms records draw_ms = 800. It
-- measures how fast the hand moved, not how long the thinking took, and there
-- is no column that measures the thinking.
--
-- redraw_count is the closest thing to a hesitation signal this schema has. It
-- counts both pressing the Redraw button AND starting a fresh stroke over a
-- finished guess, because both are the same act of changing your mind.
--
-- A consequence worth holding on to: draw_ms < 300 is one of the four suspect
-- rules, so filtering to clean rows already removes the fastest tail. Any
-- statement about "how fast people draw" is a statement about the surviving
-- distribution, not the raw one. Section 6 looks at the excluded tail
-- deliberately.


-- ---------------------------------------------------------------------------
-- 1. Draw time and revision, overall
-- ---------------------------------------------------------------------------
select
  count(*)                                                                as n,
  round(avg(draw_ms)::numeric, 0)                                         as mean_draw_ms,
  round(percentile_cont(0.10) within group (order by draw_ms)::numeric, 0) as p10_draw_ms,
  round(percentile_cont(0.50) within group (order by draw_ms)::numeric, 0) as median_draw_ms,
  round(percentile_cont(0.90) within group (order by draw_ms)::numeric, 0) as p90_draw_ms,
  max(draw_ms)                                                            as max_draw_ms,

  round(avg(redraw_count)::numeric, 2)                                    as mean_redraws,
  count(*) filter (where redraw_count = 0)                                as n_never_redrew,
  round(100.0 * count(*) filter (where redraw_count = 0) / nullif(count(*), 0), 1)
                                                                          as pct_first_try,
  count(*) filter (where redraw_count >= 3)                               as n_redrew_3_plus,
  max(redraw_count)                                                       as max_redraws
from guesses
where not is_suspect;


-- ---------------------------------------------------------------------------
-- 2. Does hesitation buy accuracy?
--
-- The genuinely interesting question in this file. If people who redraw end
-- up closer to the truth, the redraw is doing real work and is worth keeping
-- prominent in the UI. If it makes no difference, it is a comfort blanket.
--
-- Correlational, obviously: people may redraw BECAUSE a chart is hard, which
-- would push this the other way. That confound cannot be removed with the
-- columns available, and it should be stated whenever this result is quoted.
-- ---------------------------------------------------------------------------
select
  least(redraw_count, 4)                                                  as redraws_capped,
  case when redraw_count >= 4 then '4+' else redraw_count::text end       as redraws_label,
  count(*)                                                                as n,
  round(avg(mean_abs_error)::numeric, 4)                                  as mean_abs_err,
  round(percentile_cont(0.5) within group (order by mean_abs_error)::numeric, 4)
                                                                          as median_abs_err,
  round(avg(score)::numeric, 1)                                           as mean_score,
  round(avg(draw_ms)::numeric, 0)                                         as mean_draw_ms
from guesses
where not is_suspect
group by least(redraw_count, 4),
         case when redraw_count >= 4 then '4+' else redraw_count::text end
order by redraws_capped;


-- ---------------------------------------------------------------------------
-- 3. Does drawing slowly buy accuracy?
--
-- Same question, different input. Buckets are hand-picked around the shape of
-- a real stroke rather than by percentile, so the boundaries stay meaningful
-- as the sample grows instead of moving under the reader.
-- ---------------------------------------------------------------------------
select
  case
    when draw_ms <   500 then 'a. under 0.5s'
    when draw_ms <  1000 then 'b. 0.5 to 1s'
    when draw_ms <  2000 then 'c. 1 to 2s'
    when draw_ms <  4000 then 'd. 2 to 4s'
    when draw_ms <  8000 then 'e. 4 to 8s'
    else                      'f. over 8s'
  end                                                                     as draw_time_bucket,
  count(*)                                                                as n,
  round(100.0 * count(*) / sum(count(*)) over (), 1)                      as pct_of_responses,
  round(avg(mean_abs_error)::numeric, 4)                                  as mean_abs_err,
  round(avg(score)::numeric, 1)                                           as mean_score,
  round(avg(redraw_count)::numeric, 2)                                    as mean_redraws
from guesses
where not is_suspect
group by draw_time_bucket
order by draw_time_bucket;


-- ---------------------------------------------------------------------------
-- 4. Session shape
--
-- One row per session. `span_seconds` is first response to last response, so
-- a single-response session is 0 by definition, not missing.
-- ---------------------------------------------------------------------------
with per_session as (
  select
    g.session_id,
    s.device_type,
    s.country,
    s.referrer_host,
    count(*)                                                              as responses,
    count(distinct g.dataset_id)                                          as distinct_charts,
    min(g.created_at)                                                     as started_at,
    max(g.created_at)                                                     as ended_at,
    extract(epoch from (max(g.created_at) - min(g.created_at)))            as span_seconds,
    sum(g.draw_ms)                                                        as total_draw_ms,
    sum(g.redraw_count)                                                   as total_redraws,
    avg(g.mean_abs_error)                                                 as mean_abs_err,
    bool_or(g.user_id is not null)                                        as was_signed_in
  from guesses g
  join sessions s on s.id = g.session_id
  where not g.is_suspect
  group by g.session_id, s.device_type, s.country, s.referrer_host
)
select
  count(*)                                                                as sessions,
  round(avg(responses)::numeric, 2)                                       as mean_responses,
  round(percentile_cont(0.5) within group (order by responses)::numeric, 1)
                                                                          as median_responses,
  count(*) filter (where responses = 1)                                   as sessions_one_and_done,
  round(100.0 * count(*) filter (where responses = 1) / nullif(count(*), 0), 1)
                                                                          as pct_one_and_done,
  round(avg(span_seconds)::numeric, 0)                                    as mean_span_seconds,
  round(percentile_cont(0.5) within group (order by span_seconds)::numeric, 0)
                                                                          as median_span_seconds,
  -- Wall-clock time between responses, which includes reading the reveal, the
  -- crowd comparison and deciding to continue. The nearest thing to
  -- time-per-question this schema can produce, and only defined for sessions
  -- with more than one response.
  round(
    avg(span_seconds / nullif(responses - 1, 0))::numeric, 1
  )                                                                       as mean_seconds_between_responses,
  count(*) filter (where was_signed_in)                                   as sessions_signed_in
from per_session;


-- ---------------------------------------------------------------------------
-- 5. Return visits
--
-- A session is per visit, so returning can only be seen through user_id.
-- Anonymous returns are invisible here on purpose: the alternative would be a
-- durable anonymous identifier, which is exactly what this project refuses to
-- store.
-- ---------------------------------------------------------------------------
with per_user as (
  select
    g.user_id,
    count(*)                                                              as responses,
    count(distinct g.session_id)                                          as sessions,
    count(distinct g.created_at::date)                                    as active_days,
    min(g.created_at)::date                                               as first_day,
    max(g.created_at)::date                                               as last_day,
    round(avg(g.mean_abs_error)::numeric, 4)                              as mean_abs_err
  from guesses g
  where g.user_id is not null and not g.is_suspect
  group by g.user_id
)
select
  count(*)                                                                as users,
  count(*) filter (where sessions > 1)                                    as users_with_multiple_sessions,
  count(*) filter (where active_days > 1)                                 as users_active_on_multiple_days,
  round(100.0 * count(*) filter (where active_days > 1) / nullif(count(*), 0), 1)
                                                                          as pct_returned_another_day,
  round(avg(responses)::numeric, 1)                                       as mean_responses_per_user,
  round(avg(sessions)::numeric, 1)                                        as mean_sessions_per_user,
  round(avg(active_days)::numeric, 1)                                     as mean_active_days,
  round(avg(last_day - first_day)::numeric, 1)                            as mean_days_first_to_last
from per_user;


-- ---------------------------------------------------------------------------
-- 6. The tail that gets excluded
--
-- Everything above filters to clean rows. This looks at what that filter
-- removed, which is the only way to know whether the exclusion rule is
-- behaving or quietly eating real responses. Compare mean_abs_err here against
-- section 1: flagged rows being far WORSE is the expected pattern; flagged
-- rows looking normal is a sign the rule is over-firing.
-- ---------------------------------------------------------------------------
select
  is_suspect,
  count(*)                                                                as n,
  round(avg(draw_ms)::numeric, 0)                                         as mean_draw_ms,
  round(avg(redraw_count)::numeric, 2)                                    as mean_redraws,
  round(avg(mean_abs_error)::numeric, 4)                                  as mean_abs_err,
  round(avg(score)::numeric, 1)                                           as mean_score
from guesses
group by is_suspect
order by is_suspect;
