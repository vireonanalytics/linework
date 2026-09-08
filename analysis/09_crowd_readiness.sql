-- 09_crowd_readiness.sql
--
-- How close the product is to being able to show anyone the crowd.
--
-- ---------------------------------------------------------------------------
-- WHY THIS MATTERS MORE THAN IT SOUNDS
-- ---------------------------------------------------------------------------
-- The payoff of this game is seeing where everyone else drew. That view is
-- gated at CROWD_MIN_N = 50 clean responses PER CHART (lib/crowd/constants.ts),
-- enforced server-side in crowdForDataset(): below the threshold the API
-- response contains no percentiles and no sample at all, so there is no client
-- bug that could render bands it should not have.
--
-- The consequence is arithmetic, and it drives the rotation decision: with
-- every chart in circulation, answers spread thin and no chart reaches 50, so
-- every player sees "you are among the first" forever and nobody ever gets the
-- payoff. Narrowing the rotation concentrates answers. This file is how that
-- decision gets checked against reality rather than guessed at.


-- ---------------------------------------------------------------------------
-- 1. The headline arithmetic
-- ---------------------------------------------------------------------------
with rotation as (
  select
    count(*) filter (where is_active and in_rotation and retired_at is null) as in_rotation,
    count(*) filter (where is_active and not in_rotation)                    as held_back,
    count(*) filter (where retired_at is not null)                           as retired
  from datasets
),
progress as (
  select
    count(*) filter (where clean_n >= 50)                                    as charts_at_threshold,
    sum(least(clean_n, 50))                                                  as useful_responses_so_far,
    sum(greatest(0, 50 - clean_n))                                           as responses_still_needed
  from (
    select d.id, count(g.id) filter (where not g.is_suspect) as clean_n
    from datasets d
    left join guesses g on g.dataset_id = d.id
    where d.is_active and d.in_rotation and d.retired_at is null
    group by d.id
  ) x
)
select
  r.in_rotation,
  r.held_back,
  r.retired,
  p.charts_at_threshold,
  p.responses_still_needed,
  r.in_rotation * 50                                        as responses_for_full_rotation,
  (r.in_rotation + r.held_back) * 50                        as responses_if_nothing_held_back,
  round(
    100.0 * p.charts_at_threshold / nullif(r.in_rotation, 0), 1
  )                                                         as pct_of_rotation_ready
from rotation r cross join progress p;


-- ---------------------------------------------------------------------------
-- 2. Every chart in rotation, ranked by how close it is
--
-- The working list. Charts near the top are the ones worth pushing traffic at,
-- because finishing one chart is worth more than adding a response to fifty.
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  count(g.id) filter (where not g.is_suspect)               as clean_n,
  greatest(0, 50 - count(g.id) filter (where not g.is_suspect)) as still_needed,
  round(
    100.0 * least(count(g.id) filter (where not g.is_suspect), 50) / 50.0, 0
  )                                                         as pct_complete,
  count(g.id) filter (where not g.is_suspect) >= 50          as crowd_view_live,
  max(g.created_at)                                          as last_response_at
from datasets d
left join guesses g on g.dataset_id = d.id
where d.is_active and d.in_rotation and d.retired_at is null
group by d.id, d.slug, d.title
order by clean_n desc, d.title asc;


-- ---------------------------------------------------------------------------
-- 3. Is the queue actually spreading answers evenly?
--
-- nextChartForUser orders by md5(user_id || ':' || dataset_id), which gives a
-- per-user random but stable order. The intent is that no chart is starved
-- while another takes all the traffic.
--
-- This checks whether that is happening. If min and max clean counts across
-- the rotation are far apart with a decent sample, the ordering is not
-- distributing the way it is supposed to, which would be a real bug worth
-- chasing.
-- ---------------------------------------------------------------------------
with counts as (
  select
    d.id,
    count(g.id) filter (where not g.is_suspect)              as clean_n
  from datasets d
  left join guesses g on g.dataset_id = d.id
  where d.is_active and d.in_rotation and d.retired_at is null
  group by d.id
)
select
  count(*)                                                   as charts_in_rotation,
  sum(clean_n)                                               as total_clean_responses,
  min(clean_n)                                               as min_per_chart,
  round(avg(clean_n)::numeric, 2)                            as mean_per_chart,
  round(percentile_cont(0.5) within group (order by clean_n)::numeric, 1) as median_per_chart,
  max(clean_n)                                               as max_per_chart,
  round(stddev_samp(clean_n)::numeric, 2)                    as stddev_per_chart,
  count(*) filter (where clean_n = 0)                        as charts_with_zero,
  -- Coefficient of variation. Under roughly 0.3 with a real sample means the
  -- spread is doing its job; a large value means traffic is piling onto a
  -- few charts.
  round((stddev_samp(clean_n) / nullif(avg(clean_n), 0))::numeric, 2)
                                                             as coefficient_of_variation
from counts;


-- ---------------------------------------------------------------------------
-- 4. Is the precomputed crowd data current?
--
-- crowd_stats and crowd_sample are rebuilt by recompute_crowd_stats(), run by
-- pg_cron every 15 minutes. Nothing computes them on request, by design: the
-- function takes no arguments, so no code path lets a request trigger it.
--
-- A stale computed_at means the cron job has stopped. That fails silently -
-- the crowd view just keeps showing older numbers - so it is worth checking
-- deliberately rather than waiting to notice.
-- ---------------------------------------------------------------------------
select
  'crowd_stats'                                              as table_name,
  count(distinct dataset_id)                                 as datasets_covered,
  count(*)                                                   as rows,
  max(computed_at)                                           as last_computed_at,
  round(extract(epoch from (now() - max(computed_at))) / 60.0, 1) as minutes_since,
  case
    when max(computed_at) > now() - interval '30 minutes' then 'current'
    when max(computed_at) > now() - interval '2 hours'    then 'late'
    else 'STALE - check the pg_cron job'
  end                                                        as freshness
from crowd_stats
union all
select
  'crowd_sample',
  count(distinct dataset_id),
  count(*),
  max(computed_at),
  round(extract(epoch from (now() - max(computed_at))) / 60.0, 1),
  case
    when max(computed_at) > now() - interval '30 minutes' then 'current'
    when max(computed_at) > now() - interval '2 hours'    then 'late'
    else 'STALE - check the pg_cron job'
  end
from crowd_sample;


-- ---------------------------------------------------------------------------
-- 5. Does the precomputed crowd agree with the raw guesses?
--
-- crowd_stats.n is denormalised onto all 40 rows of a dataset so a read never
-- needs a second query. This checks that number against a live count of the
-- underlying rows.
--
-- A mismatch is expected and harmless while it is small: the aggregate is up
-- to 15 minutes behind by design. A LARGE or growing gap means the recompute
-- is failing rather than merely lagging.
-- ---------------------------------------------------------------------------
select
  d.slug,
  max(cs.n)                                                  as n_in_crowd_stats,
  count(g.id) filter (where not g.is_suspect)                as n_live,
  max(cs.n) - count(g.id) filter (where not g.is_suspect)    as drift,
  max(cs.computed_at)                                        as computed_at
from datasets d
join crowd_stats cs on cs.dataset_id = d.id
left join guesses g on g.dataset_id = d.id
group by d.id, d.slug
having max(cs.n) <> count(g.id) filter (where not g.is_suspect)
order by abs(max(cs.n) - count(g.id) filter (where not g.is_suspect)) desc;
