-- 05_directional_bias.sql
--
-- The column this whole project exists to fill.
--
-- ---------------------------------------------------------------------------
-- WHY SIGNED ERROR IS THE POINT
-- ---------------------------------------------------------------------------
-- Absolute error says people are wrong. Signed error says WHICH DIRECTION, and
-- a direction that holds across many people is a claim about public belief
-- rather than about individual accuracy. It has been the most important column
-- in this schema since it was designed; see docs/DESIGN.md.
--
-- Sign convention, and it is easy to get backwards:
--     POSITIVE = the player drew ABOVE the truth = OVERESTIMATED
--     NEGATIVE = the player drew BELOW the truth = UNDERESTIMATED
--
-- "Overestimated the value on the chart" is not the same sentence as
-- "overestimated the problem". On a chart of child mortality, drawing too high
-- means believing the world is worse than it is. On a chart of vaccination
-- coverage, drawing too high means believing it is better. The direction of
-- the VALUE is what is measured here; the direction of the BELIEF has to be
-- read per chart by a human who knows which way is good. Do not automate that
-- step, and do not let a summary table imply it has been done.
--
-- ---------------------------------------------------------------------------
-- THRESHOLD
-- ---------------------------------------------------------------------------
-- 0.01 normalised is the same cutoff the game itself uses to print "Drew too
-- high / too low / On the line" (DrawTheLine.tsx), and the same one
-- lib/crowd/compare.ts uses as BIAS_EPSILON = 10 on the 0..1000 scale. Reused
-- deliberately so an analysis result can never contradict what a player was
-- told about their own guess.


-- ---------------------------------------------------------------------------
-- 1. Directional bias per question
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  d.y_unit,
  count(*)                                                            as n,

  round(avg(g.mean_signed_error)::numeric, 4)                         as mean_signed_norm,
  round(
    percentile_cont(0.5) within group (order by g.mean_signed_error)::numeric, 4
  )                                                                   as median_signed_norm,
  round(
    (avg(g.mean_signed_error) * (d.y_domain_max - d.y_domain_min))::numeric, 2
  )                                                                   as mean_signed_units,

  case
    when avg(g.mean_signed_error) >  0.01 then 'overestimated'
    when avg(g.mean_signed_error) < -0.01 then 'underestimated'
    else 'on the line'
  end                                                                 as direction,

  -- Headcount, not just the average. An average of zero can mean everyone was
  -- accurate, or that half drew far too high and half far too low - opposite
  -- findings that the mean alone cannot tell apart.
  count(*) filter (where g.mean_signed_error >  0.01)                 as n_over,
  count(*) filter (where g.mean_signed_error < -0.01)                 as n_under,
  count(*) filter (where abs(g.mean_signed_error) <= 0.01)            as n_on_the_line,
  round(
    100.0 * count(*) filter (where g.mean_signed_error > 0.01) / nullif(count(*), 0), 1
  )                                                                   as pct_over,

  -- Agreement. If the crowd leaned one way, did they lean together? A mean
  -- smaller than its own standard deviation is not a direction, it is noise.
  round(stddev_samp(g.mean_signed_error)::numeric, 4)                 as stddev_signed,
  round(
    (avg(g.mean_signed_error) / nullif(stddev_samp(g.mean_signed_error), 0))::numeric, 2
  )                                                                   as mean_over_stddev
from guesses g
join datasets d on d.id = g.dataset_id
where not g.is_suspect
group by d.id, d.slug, d.title, d.y_unit, d.y_domain_min, d.y_domain_max
having count(*) >= 5
order by abs(avg(g.mean_signed_error)) desc;


-- ---------------------------------------------------------------------------
-- 2. Bias against the DIRECTION OF THE REAL TREND
--
-- The more interesting cut, and one the raw sign cannot give you.
--
-- For each chart, compare the truth at the reveal boundary against the truth
-- at the end: that is what actually happened, up or down. Then ask whether
-- people under-drew the size of that move. A crowd that gets the direction
-- right but consistently under-draws the magnitude is a real and specific
-- finding: people know the trend and underestimate how far it went.
--
-- `pct_of_real_move_drawn` is the headline: 100 means the typical person drew
-- exactly the real change, 50 means they drew half of it, and a negative
-- number means they drew the move in the wrong direction entirely.
-- ---------------------------------------------------------------------------
with truth_endpoints as (
  select
    d.id                                                              as dataset_id,
    d.slug,
    d.title,
    d.y_domain_min,
    d.y_domain_max,
    -- Value at the last revealed point, i.e. the anchor the player draws from.
    (d.y_values ->> d.reveal_from_index)::double precision            as y_at_boundary,
    -- Value at the final point, i.e. what actually happened.
    (d.y_values ->> (jsonb_array_length(d.y_values) - 1))::double precision as y_at_end
  from datasets d
),
truth_move as (
  select
    t.*,
    (t.y_at_end - t.y_at_boundary)                                    as real_move_units,
    -- Same move expressed on the normalised 0..1 scale the guesses use.
    (t.y_at_end - t.y_at_boundary) / (t.y_domain_max - t.y_domain_min) as real_move_norm
  from truth_endpoints t
)
select
  tm.slug,
  tm.title,
  count(*)                                                            as n,
  round(tm.real_move_units::numeric, 2)                               as real_move_units,
  case
    when tm.real_move_units > 0 then 'rose'
    when tm.real_move_units < 0 then 'fell'
    else 'flat'
  end                                                                 as what_really_happened,
  round(avg(g.mean_signed_error)::numeric, 4)                         as mean_signed_norm,
  -- The typical drawn endpoint move, reconstructed: the truth's move plus the
  -- average signed offset from it.
  round((tm.real_move_norm + avg(g.mean_signed_error))::numeric, 4)   as mean_drawn_move_norm,
  round(
    (100.0 * (tm.real_move_norm + avg(g.mean_signed_error))
      / nullif(tm.real_move_norm, 0))::numeric, 1
  )                                                                   as pct_of_real_move_drawn,
  case
    when tm.real_move_norm = 0 then 'flat series, not applicable'
    when (tm.real_move_norm + avg(g.mean_signed_error)) / tm.real_move_norm < 0
      then 'drew the move BACKWARDS'
    when (tm.real_move_norm + avg(g.mean_signed_error)) / tm.real_move_norm < 0.75
      then 'understated the move'
    when (tm.real_move_norm + avg(g.mean_signed_error)) / tm.real_move_norm > 1.25
      then 'overstated the move'
    else 'about right'
  end                                                                 as verdict
from truth_move tm
join guesses g on g.dataset_id = tm.dataset_id
where not g.is_suspect
group by tm.slug, tm.title, tm.real_move_units, tm.real_move_norm
having count(*) >= 5
order by n desc;


-- ---------------------------------------------------------------------------
-- 3. Bias by topic
--
-- CAVEAT: there is no topic column. `datasets` carries slug, title, question,
-- source and provenance, and nothing that groups charts by subject. The CASE
-- below is a KEYWORD HEURISTIC over the slug, written by hand, and it will
-- misfile charts.
--
-- It is here because the question "do people misjudge health differently from
-- economics" is worth asking, and a rough answer beats none. It should be
-- replaced by a real `topic` column on `datasets` before any result from it is
-- published. Until then, treat every row as provisional and spot-check the
-- membership with section 4 before quoting it.
-- ---------------------------------------------------------------------------
with topics as (
  select
    d.id                                                              as dataset_id,
    d.slug,
    case
      when d.slug ~ 'mortality|death|life-expectancy|disease|health|hospital|hiv|tubercul|malaria|suicide|cancer|immuni|vaccin|birth|fertility|maternal'
        then 'health'
      when d.slug ~ 'gdp|income|inflation|unemploy|poverty|wage|labor|labour|employ|trade|export|import|debt|tax|manufactur|industry|productiv'
        then 'economy'
      when d.slug ~ 'co2|emission|energy|electric|renewable|solar|forest|climate|water|pollut|coal|fossil'
        then 'environment'
      when d.slug ~ 'crime|homicide|violen|prison|incarcerat|firearm|gun|war|conflict|terror'
        then 'crime and conflict'
      when d.slug ~ 'school|education|literacy|enroll|reading|student|teacher'
        then 'education'
      when d.slug ~ 'internet|mobile|phone|broadband|technolog|research|patent'
        then 'technology'
      when d.slug ~ 'population|urban|migrat|refugee|immigra'
        then 'population'
      else 'unclassified'
    end                                                               as topic
  from datasets d
)
select
  t.topic,
  count(distinct t.dataset_id) filter (where g.id is not null)        as questions_with_data,
  count(g.id)                                                         as n,
  round(avg(g.mean_signed_error)::numeric, 4)                         as mean_signed_norm,
  round(avg(g.mean_abs_error)::numeric, 4)                            as mean_abs_norm,
  round(avg(g.score)::numeric, 1)                                     as mean_score,
  count(g.id) filter (where g.mean_signed_error >  0.01)              as n_over,
  count(g.id) filter (where g.mean_signed_error < -0.01)              as n_under,
  case
    when avg(g.mean_signed_error) >  0.01 then 'overestimated'
    when avg(g.mean_signed_error) < -0.01 then 'underestimated'
    else 'on the line'
  end                                                                 as direction
from topics t
join guesses g on g.dataset_id = t.dataset_id and not g.is_suspect
group by t.topic
order by n desc;


-- ---------------------------------------------------------------------------
-- 4. Audit the heuristic above
--
-- Run this before believing section 3. It shows which charts landed in which
-- bucket, so a misfiled chart is visible rather than silently averaged in.
-- Anything large in 'unclassified' means the keyword list needs extending, or
-- better, that the real column should finally be added.
-- ---------------------------------------------------------------------------
select
  case
    when d.slug ~ 'mortality|death|life-expectancy|disease|health|hospital|hiv|tubercul|malaria|suicide|cancer|immuni|vaccin|birth|fertility|maternal' then 'health'
    when d.slug ~ 'gdp|income|inflation|unemploy|poverty|wage|labor|labour|employ|trade|export|import|debt|tax|manufactur|industry|productiv' then 'economy'
    when d.slug ~ 'co2|emission|energy|electric|renewable|solar|forest|climate|water|pollut|coal|fossil' then 'environment'
    when d.slug ~ 'crime|homicide|violen|prison|incarcerat|firearm|gun|war|conflict|terror' then 'crime and conflict'
    when d.slug ~ 'school|education|literacy|enroll|reading|student|teacher' then 'education'
    when d.slug ~ 'internet|mobile|phone|broadband|technolog|research|patent' then 'technology'
    when d.slug ~ 'population|urban|migrat|refugee|immigra' then 'population'
    else 'unclassified'
  end                                                                 as topic,
  count(*)                                                            as charts,
  count(*) filter (where d.is_active and d.in_rotation)               as charts_in_rotation,
  string_agg(d.slug, ', ' order by d.slug)
    filter (where d.is_active and d.in_rotation)                      as slugs_in_rotation
from datasets d
where d.retired_at is null
group by topic
order by charts desc;
