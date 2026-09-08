-- 07_shape_of_error.sql
--
-- WHERE along the chart people go wrong, not just how far.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE IS THE MOST VALUABLE ONE HERE
-- ---------------------------------------------------------------------------
-- Every other query in this directory reduces a drawn line to the three
-- summary numbers already stored on the row: score, mean_abs_error,
-- mean_signed_error. Those are averages over 40 points, so they cannot
-- distinguish a person who was uniformly a little wrong from a person who
-- traced the first half perfectly and then went badly off at the end. Those
-- are different beliefs.
--
-- guesses.path is the actual 40-point line. It is the dataset. This file is
-- the one that reads it.
--
-- ---------------------------------------------------------------------------
-- THE TRUTH CTE MIRRORS truthPathNormalized() IN lib/scoring/score.ts
-- ---------------------------------------------------------------------------
-- The stored series has one point per year; a drawn path always has 40 points.
-- They are not comparable until the truth is resampled onto the same 40 x
-- positions by linear interpolation. That resampling is defined in TypeScript
-- and reproduced here in SQL.
--
-- These are two implementations of one definition, on opposite sides of a
-- language boundary, with nothing that automatically checks they agree. If you
-- change one, change the other. 13_integrity_checks.sql section 1 is the
-- check: it recomputes mean_abs_error from this CTE and compares it against
-- the value the server stored. Run it after any edit to either side.
--
-- The same CTE is duplicated in 13_integrity_checks.sql. Deliberately: these
-- files are meant to be runnable by pasting one of them into a client, and a
-- shared view would make every file depend on having installed it first.
--
-- Scoped to path_resolution = 40 because the truth is resampled to exactly 40
-- points here. Nothing in production has ever stored another resolution;
-- 13_integrity_checks.sql section 4 asserts that rather than assuming it.


-- ---------------------------------------------------------------------------
-- 1. Error by position along the chart, pooled across all questions
--
-- x_index 0 is the reveal boundary (the last point the player was shown) and
-- 39 is the right edge. Expect error to grow left to right: position 0 is
-- anchored to a visible value, position 39 is a pure prediction.
--
-- If it does NOT grow, that is a finding about how people extrapolate. If it
-- is large at position 0, that is a UI bug, not a belief - it would mean
-- people are failing to start their line where the known data ends.
-- ---------------------------------------------------------------------------
with truth as (
  select
    d.id                                                                  as dataset_id,
    i.i                                                                   as x_index,
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
    ) / (d.y_domain_max - d.y_domain_min)                                 as truth_unit
  from datasets d
  cross join generate_series(0, 39) as i(i)
  cross join lateral (
    select d.reveal_from_index
         + ((jsonb_array_length(d.y_values) - 1 - d.reveal_from_index)::double precision * i.i)
           / 39.0                                                         as position
  ) pos
),
guess_points as (
  select
    g.id                                                                  as guess_id,
    g.dataset_id,
    (p.ord - 1)::int                                                      as x_index,
    p.val / 1000.0                                                        as guess_unit
  from guesses g
  cross join lateral unnest(g.path) with ordinality as p(val, ord)
  where not g.is_suspect and g.path_resolution = 40
)
select
  gp.x_index,
  count(*)                                                                as n,
  round(avg(abs(gp.guess_unit - t.truth_unit))::numeric, 4)               as mean_abs_err,
  round(avg(gp.guess_unit - t.truth_unit)::numeric, 4)                    as mean_signed_err,
  round(
    percentile_cont(0.5) within group (order by gp.guess_unit - t.truth_unit)::numeric, 4
  )                                                                       as median_signed_err,
  round(stddev_samp(gp.guess_unit - t.truth_unit)::numeric, 4)            as stddev_signed_err,
  round(
    100.0 * count(*) filter (where gp.guess_unit > t.truth_unit) / nullif(count(*), 0), 1
  )                                                                       as pct_above_truth
from guess_points gp
join truth t on t.dataset_id = gp.dataset_id and t.x_index = gp.x_index
group by gp.x_index
order by gp.x_index;


-- ---------------------------------------------------------------------------
-- 2. Same, per question
--
-- Where a specific chart loses people. Useful for judging whether a chart's
-- reveal boundary was cut in a sensible place: a chart whose error is already
-- large at low x_index is probably asking people to extrapolate from an
-- anchor they could not read.
-- ---------------------------------------------------------------------------
with truth as (
  select
    d.id                                                                  as dataset_id,
    d.slug,
    i.i                                                                   as x_index,
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
    ) / (d.y_domain_max - d.y_domain_min)                                 as truth_unit
  from datasets d
  cross join generate_series(0, 39) as i(i)
  cross join lateral (
    select d.reveal_from_index
         + ((jsonb_array_length(d.y_values) - 1 - d.reveal_from_index)::double precision * i.i)
           / 39.0                                                         as position
  ) pos
),
guess_points as (
  select
    g.dataset_id,
    (p.ord - 1)::int                                                      as x_index,
    p.val / 1000.0                                                        as guess_unit
  from guesses g
  cross join lateral unnest(g.path) with ordinality as p(val, ord)
  where not g.is_suspect and g.path_resolution = 40
)
select
  t.slug,
  gp.x_index,
  count(*)                                                                as n,
  round(avg(abs(gp.guess_unit - t.truth_unit))::numeric, 4)               as mean_abs_err,
  round(avg(gp.guess_unit - t.truth_unit)::numeric, 4)                    as mean_signed_err
from guess_points gp
join truth t on t.dataset_id = gp.dataset_id and t.x_index = gp.x_index
group by t.slug, gp.x_index
having count(*) >= 5
order by t.slug, gp.x_index;


-- ---------------------------------------------------------------------------
-- 3. Do people draw straight lines?
--
-- A specific, testable hypothesis about how people extrapolate: that most
-- reach for a straight continuation regardless of what the series was doing.
--
-- `straightness` is 1.0 for a perfectly straight drawn line and falls toward 0
-- as the line bends. It is computed as the ratio of the net move (last point
-- minus first) to the total distance travelled (sum of absolute step sizes):
-- a straight line's steps all point the same way so the two are equal, while
-- a wiggly line travels further than it ends up.
--
-- A high mean here is a real finding and a useful one, because it says the
-- crowd's belief is not "the trend continues in shape" but "the trend
-- continues in a straight line", which is a different and stronger claim.
-- ---------------------------------------------------------------------------
with steps as (
  select
    g.id                                                                  as guess_id,
    g.dataset_id,
    p.ord,
    p.val - lag(p.val) over (partition by g.id order by p.ord)            as delta
  from guesses g
  cross join lateral unnest(g.path) with ordinality as p(val, ord)
  where not g.is_suspect and g.path_resolution = 40
),
-- Reversals are counted over the NON-ZERO steps only, with the previous
-- non-zero direction carried forward. Counting over every step would treat a
-- flat segment between two rises (+1, 0, +1) as two direction changes, and
-- would miss a genuine reversal separated by a flat run (+1, 0, -1).
nonzero_steps as (
  select
    guess_id,
    ord,
    sign(delta)                                                           as dir,
    lag(sign(delta)) over (partition by guess_id order by ord)             as prev_dir
  from steps
  where delta is not null and delta <> 0
),
travel as (
  select guess_id, dataset_id, sum(abs(delta)) as total_travel
  from steps
  where delta is not null
  group by guess_id, dataset_id
),
reversals as (
  select guess_id, count(*) filter (where prev_dir is not null and dir <> prev_dir) as reversals
  from nonzero_steps
  group by guess_id
),
endpoints as (
  select g.id as guess_id, (g.path[40] - g.path[1])::double precision as net_move
  from guesses g
  where not g.is_suspect and g.path_resolution = 40
),
per_guess as (
  select
    t.guess_id,
    t.dataset_id,
    t.total_travel,
    e.net_move,
    coalesce(r.reversals, 0)                                              as reversals
  from travel t
  join endpoints e on e.guess_id = t.guess_id
  left join reversals r on r.guess_id = t.guess_id
)
select
  count(*)                                                                as n,
  round(avg(
    abs(net_move) / nullif(total_travel, 0)
  )::numeric, 3)                                                          as mean_straightness,
  round(percentile_cont(0.5) within group (
    order by abs(net_move) / nullif(total_travel, 0)
  )::numeric, 3)                                                          as median_straightness,
  count(*) filter (where abs(net_move) / nullif(total_travel, 0) > 0.95)  as n_near_perfectly_straight,
  round(
    100.0 * count(*) filter (where abs(net_move) / nullif(total_travel, 0) > 0.95)
      / nullif(count(*), 0), 1
  )                                                                       as pct_near_straight,
  round(avg(reversals)::numeric, 2)                                       as mean_reversals,
  round(avg(total_travel)::numeric, 1)                                    as mean_total_travel_quantised
from per_guess;


-- ---------------------------------------------------------------------------
-- 4. Endpoint belief
--
-- The single most quotable number per chart: where did people think the line
-- ENDED UP, versus where it actually ended up. This is the figure that turns
-- into a sentence a journalist can print, e.g. "the typical person put it at
-- 42 when the real figure is 27".
--
-- Uses only x_index 39 (the final drawn point) against the series' true final
-- value, so no interpolation is involved and nothing can drift.
-- ---------------------------------------------------------------------------
with final_points as (
  select
    g.dataset_id,
    g.path[40] / 1000.0                                                   as guess_end_unit
  from guesses g
  where not g.is_suspect and g.path_resolution = 40
)
select
  d.slug,
  d.title,
  d.y_unit,
  count(*)                                                                as n,
  round(
    ((d.y_values ->> (jsonb_array_length(d.y_values) - 1))::double precision)::numeric, 2
  )                                                                       as actual_final_value,
  round(
    (d.y_domain_min + avg(f.guess_end_unit) * (d.y_domain_max - d.y_domain_min))::numeric, 2
  )                                                                       as mean_guessed_final_value,
  round(
    (d.y_domain_min
      + percentile_cont(0.5) within group (order by f.guess_end_unit)
        * (d.y_domain_max - d.y_domain_min))::numeric, 2
  )                                                                       as median_guessed_final_value,
  round(
    (d.y_domain_min + avg(f.guess_end_unit) * (d.y_domain_max - d.y_domain_min)
      - (d.y_values ->> (jsonb_array_length(d.y_values) - 1))::double precision)::numeric, 2
  )                                                                       as mean_gap_units,
  case
    when d.y_domain_min + avg(f.guess_end_unit) * (d.y_domain_max - d.y_domain_min)
       > (d.y_values ->> (jsonb_array_length(d.y_values) - 1))::double precision
      then 'guessed too high'
    else 'guessed too low'
  end                                                                     as direction
from final_points f
join datasets d on d.id = f.dataset_id
group by d.id, d.slug, d.title, d.y_unit, d.y_values, d.y_domain_min, d.y_domain_max
having count(*) >= 5
order by abs(
  avg(f.guess_end_unit) * (d.y_domain_max - d.y_domain_min)
  + d.y_domain_min
  - (d.y_values ->> (jsonb_array_length(d.y_values) - 1))::double precision
) desc;
