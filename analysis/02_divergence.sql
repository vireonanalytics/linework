-- 02_divergence.sql
--
-- The headline finding: for each question, how far the typical person's line
-- sat from what actually happened.
--
-- ---------------------------------------------------------------------------
-- WHAT THE NUMBERS MEAN, because the units matter and are easy to misreport
-- ---------------------------------------------------------------------------
-- guesses.mean_abs_error is already the mean |guess - truth| across the 40
-- resampled points, in NORMALISED units: 0 = traced the line exactly, 1 = drew
-- at the opposite end of the chart's y-axis at every point. It is computed
-- server-side from the database's own copy of the series (never from the
-- client) in app/api/guess/route.ts.
--
-- Normalised error is the only figure comparable ACROSS questions, because
-- every chart has a different y-axis. It is also meaningless to a reader.
-- So this query reports both:
--
--   * `*_norm`  - 0..1, comparable across questions. Use for ranking.
--   * `*_units` - the same figure multiplied back up by the chart's y-domain
--                 span, so it lands in the chart's own units. Use for quoting.
--
-- Multiplying back is exact, not an approximation: the normalisation is a
-- linear map over [y_domain_min, y_domain_max], so scaling by the span
-- inverts it precisely.
--
-- ---------------------------------------------------------------------------
-- WHY MEDIAN IS REPORTED ALONGSIDE MEAN
-- ---------------------------------------------------------------------------
-- The mean of an error distribution is dragged by a handful of people who drew
-- something wild. The median is what a typical person did. When the two
-- disagree sharply the distribution is skewed and the mean should not be the
-- number that gets quoted. `mean_minus_median_norm` makes that visible in the
-- same row rather than requiring a second query to notice it.


-- ---------------------------------------------------------------------------
-- 1. Divergence per question, ranked worst first
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  d.y_unit,
  count(*)                                                        as n,

  -- Comparable across questions.
  round(avg(g.mean_abs_error)::numeric, 4)                        as mean_abs_err_norm,
  round(
    percentile_cont(0.5) within group (order by g.mean_abs_error)::numeric, 4
  )                                                               as median_abs_err_norm,
  round(
    (avg(g.mean_abs_error)
     - percentile_cont(0.5) within group (order by g.mean_abs_error))::numeric, 4
  )                                                               as mean_minus_median_norm,

  -- Quotable, in the chart's own units.
  round(
    (avg(g.mean_abs_error) * (d.y_domain_max - d.y_domain_min))::numeric, 2
  )                                                               as mean_abs_err_units,
  round(
    (percentile_cont(0.5) within group (order by g.mean_abs_error)
     * (d.y_domain_max - d.y_domain_min))::numeric, 2
  )                                                               as median_abs_err_units,

  -- Spread. A high stddev with a low mean means people disagreed with each
  -- other, which is a different and often more interesting story than
  -- everyone being wrong in the same way.
  round(stddev_samp(g.mean_abs_error)::numeric, 4)                as stddev_abs_err_norm,
  round(min(g.mean_abs_error)::numeric, 4)                        as best_abs_err_norm,
  round(max(g.mean_abs_error)::numeric, 4)                        as worst_abs_err_norm,

  round(avg(g.score)::numeric, 1)                                 as mean_score,
  round(
    percentile_cont(0.5) within group (order by g.score)::numeric, 1
  )                                                               as median_score
from guesses g
join datasets d on d.id = g.dataset_id
where not g.is_suspect
group by d.id, d.slug, d.title, d.y_unit, d.y_domain_min, d.y_domain_max
-- Reporting a rank over a handful of responses invites exactly the
-- overreading this whole directory is trying to prevent. Raise this before
-- quoting anything; 50 is the threshold the product itself uses.
having count(*) >= 5
order by mean_abs_err_norm desc;


-- ---------------------------------------------------------------------------
-- 2. The distribution behind the headline, per question
--
-- Deciles of absolute error. A single mean hides whether the crowd was
-- uniformly a bit wrong or split into two camps, and those are different
-- findings. Run this for any question before quoting its row above.
-- ---------------------------------------------------------------------------
select
  d.slug,
  count(*)                                                                    as n,
  round(percentile_cont(0.10) within group (order by g.mean_abs_error)::numeric, 4) as p10,
  round(percentile_cont(0.25) within group (order by g.mean_abs_error)::numeric, 4) as p25,
  round(percentile_cont(0.50) within group (order by g.mean_abs_error)::numeric, 4) as p50,
  round(percentile_cont(0.75) within group (order by g.mean_abs_error)::numeric, 4) as p75,
  round(percentile_cont(0.90) within group (order by g.mean_abs_error)::numeric, 4) as p90,
  -- Interquartile range: how much people disagreed with each other, robust to
  -- the tails.
  round(
    (percentile_cont(0.75) within group (order by g.mean_abs_error)
     - percentile_cont(0.25) within group (order by g.mean_abs_error))::numeric, 4
  )                                                                           as iqr
from guesses g
join datasets d on d.id = g.dataset_id
where not g.is_suspect
group by d.id, d.slug
having count(*) >= 5
order by iqr desc;


-- ---------------------------------------------------------------------------
-- 3. One overall number, for when someone asks "so how wrong are people?"
--
-- Deliberately last, and deliberately carries its own n. Pooling every
-- response across every question weights the answer toward whichever charts
-- happened to get the most traffic, so this is a summary of THIS SAMPLE, not
-- an estimate of public misperception in general.
-- ---------------------------------------------------------------------------
select
  count(*)                                                                    as n,
  count(distinct dataset_id)                                                  as questions,
  round(avg(mean_abs_error)::numeric, 4)                                      as mean_abs_err_norm,
  round(percentile_cont(0.5) within group (order by mean_abs_error)::numeric, 4) as median_abs_err_norm,
  round(avg(score)::numeric, 1)                                               as mean_score,
  -- Share of responses that were closer to the truth than a coin-flip-bad
  -- line. 0.10 normalised is a tenth of the chart's full height.
  round(100.0 * count(*) filter (where mean_abs_error <= 0.10) / nullif(count(*), 0), 1)
                                                                              as pct_within_10pct_of_axis
from guesses
where not is_suspect;
