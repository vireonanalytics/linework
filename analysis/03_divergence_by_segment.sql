-- 03_divergence_by_segment.sql
--
-- Does being wrong vary by anything this project actually captures?
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE READING ANY RESULT BELOW
-- ---------------------------------------------------------------------------
-- Every segment here is confounded by WHICH QUESTIONS that segment answered.
-- Charts differ enormously in difficulty, and chart order is randomised per
-- user (nextChartForUser orders by md5(user_id || ':' || dataset_id)), so two
-- segments will have answered overlapping but different sets of questions.
-- A raw comparison of "mobile users are worse than desktop users" may be
-- entirely an artefact of mobile users having drawn harder charts.
--
-- Section 6 does the within-question comparison that controls for this. The
-- earlier sections are the raw cut, kept because it is the first thing anyone
-- asks for - but the raw cut is the one that produces wrong headlines.
--
-- What this project can segment on, and what it deliberately cannot:
--   sessions.device_type    - four coarse buckets, deliberately blunt
--   sessions.country        - ISO-2 only, from x-vercel-ip-country
--   sessions.referrer_host  - hostname only, no path, no query string
--   guesses.order_in_session- position within a sitting, 1-based
--   guesses.created_at      - UTC. NOT the respondent's local time; see below
--   users.state / birth_year- self-reported, signed-in players only (see 12)
--
-- There is no age, gender, income, education or political affiliation for
-- anonymous players, by design. Nothing here can be segmented on them.


-- ---------------------------------------------------------------------------
-- 1. By device type
-- ---------------------------------------------------------------------------
select
  coalesce(s.device_type, 'unknown')                              as device_type,
  count(*)                                                        as n,
  count(distinct g.dataset_id)                                    as questions,
  round(avg(g.mean_abs_error)::numeric, 4)                        as mean_abs_err,
  round(percentile_cont(0.5) within group (order by g.mean_abs_error)::numeric, 4) as median_abs_err,
  round(avg(g.mean_signed_error)::numeric, 4)                     as mean_signed_err,
  round(avg(g.score)::numeric, 1)                                 as mean_score,
  round(avg(g.draw_ms)::numeric, 0)                               as mean_draw_ms,
  round(avg(g.redraw_count)::numeric, 2)                          as mean_redraws,
  round(avg(g.viewport_w)::numeric, 0)                            as mean_viewport_w
from guesses g
join sessions s on s.id = g.session_id
where not g.is_suspect
group by coalesce(s.device_type, 'unknown')
order by n desc;


-- ---------------------------------------------------------------------------
-- 2. By country
--
-- Country is where the REQUEST came from, not where the respondent is from.
-- A VPN, a corporate proxy or a holiday all break that assumption, and none
-- of them are detectable here.
-- ---------------------------------------------------------------------------
select
  coalesce(s.country, 'unknown')                                  as country,
  count(*)                                                        as n,
  count(distinct g.session_id)                                    as sessions,
  round(avg(g.mean_abs_error)::numeric, 4)                        as mean_abs_err,
  round(avg(g.mean_signed_error)::numeric, 4)                     as mean_signed_err,
  round(avg(g.score)::numeric, 1)                                 as mean_score
from guesses g
join sessions s on s.id = g.session_id
where not g.is_suspect
group by coalesce(s.country, 'unknown')
order by n desc;


-- ---------------------------------------------------------------------------
-- 3. By referrer host
--
-- Where the traffic came from. Useful for judging whether one channel brings
-- people who engage differently, e.g. whether a Reddit audience draws more
-- carefully than a link from a group chat.
-- ---------------------------------------------------------------------------
select
  coalesce(s.referrer_host, '(direct or unknown)')                as referrer_host,
  count(*)                                                        as n,
  count(distinct g.session_id)                                    as sessions,
  round(avg(g.mean_abs_error)::numeric, 4)                        as mean_abs_err,
  round(avg(g.score)::numeric, 1)                                 as mean_score,
  round(avg(g.draw_ms)::numeric, 0)                               as mean_draw_ms,
  round(100.0 * count(*) filter (where g.user_id is not null) / nullif(count(*), 0), 1)
                                                                  as pct_registered
from guesses g
join sessions s on s.id = g.session_id
where not g.is_suspect
group by coalesce(s.referrer_host, '(direct or unknown)')
order by n desc;


-- ---------------------------------------------------------------------------
-- 4. By position in the sitting
--
-- Does the tenth chart in a session get a worse answer than the first?
-- Two plausible and opposite effects, and this is where they show up:
-- warming up (people get better as they learn the interface) versus fatigue
-- (people get sloppier as they get bored).
-- ---------------------------------------------------------------------------
select
  g.order_in_session,
  count(*)                                                        as n,
  round(avg(g.mean_abs_error)::numeric, 4)                        as mean_abs_err,
  round(avg(g.mean_signed_error)::numeric, 4)                     as mean_signed_err,
  round(avg(g.score)::numeric, 1)                                 as mean_score,
  round(avg(g.draw_ms)::numeric, 0)                               as mean_draw_ms,
  round(avg(g.redraw_count)::numeric, 2)                          as mean_redraws,
  -- Share of this whole result set sitting at this position, so a long tail
  -- of rare high positions is visibly rare rather than looking like a trend.
  round(100.0 * count(*) / sum(count(*)) over (), 2)              as pct_of_responses
from guesses g
where not g.is_suspect
group by g.order_in_session
order by g.order_in_session;


-- ---------------------------------------------------------------------------
-- 5. By hour of day (UTC)
--
-- CAVEAT, and it is a big one: created_at is UTC and this project stores no
-- timezone for the respondent. 14:00 UTC is mid-afternoon in London, morning
-- in New York and evening in Delhi. Until the sample is dominated by one
-- country this bucket does not mean "time of day" to any actual person.
--
-- Kept because it is genuinely useful for operations (when does traffic
-- arrive, when should a post go out) even while it is useless as a
-- behavioural segment.
-- ---------------------------------------------------------------------------
select
  extract(hour from g.created_at at time zone 'UTC')::int         as hour_utc,
  count(*)                                                        as n,
  count(distinct g.session_id)                                    as sessions,
  round(avg(g.mean_abs_error)::numeric, 4)                        as mean_abs_err,
  round(avg(g.score)::numeric, 1)                                 as mean_score,
  round(avg(g.draw_ms)::numeric, 0)                               as mean_draw_ms
from guesses g
where not g.is_suspect
group by hour_utc
order by hour_utc;


-- ---------------------------------------------------------------------------
-- 6. Registered vs anonymous, CONTROLLED FOR QUESTION
--
-- This is the one to trust. Rather than comparing two pools that answered
-- different charts, it compares the two groups WITHIN each chart and then
-- averages those per-chart differences. A positive `registered_minus_anon`
-- means registered players were further from the truth on the same question.
--
-- Only charts where both groups appear are included, because a chart with no
-- anonymous responses contributes no comparison, only noise.
-- ---------------------------------------------------------------------------
with per_question as (
  select
    g.dataset_id,
    count(*) filter (where g.user_id is not null)                 as n_registered,
    count(*) filter (where g.user_id is null)                     as n_anon,
    avg(g.mean_abs_error) filter (where g.user_id is not null)    as err_registered,
    avg(g.mean_abs_error) filter (where g.user_id is null)        as err_anon
  from guesses g
  where not g.is_suspect
  group by g.dataset_id
)
select
  count(*)                                                        as questions_compared,
  sum(n_registered)                                               as n_registered,
  sum(n_anon)                                                     as n_anon,
  round(avg(err_registered)::numeric, 4)                          as mean_err_registered,
  round(avg(err_anon)::numeric, 4)                                as mean_err_anon,
  round(avg(err_registered - err_anon)::numeric, 4)               as registered_minus_anon,
  -- How consistent the direction is. A mean difference with a stddev several
  -- times its own size is not a difference.
  round(stddev_samp(err_registered - err_anon)::numeric, 4)       as stddev_of_difference
from per_question
where n_registered > 0 and n_anon > 0;
