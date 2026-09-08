-- 10_demographics.sql
--
-- Divergence by who the respondent is, for the respondents who told us.
--
-- ---------------------------------------------------------------------------
-- THE LIMIT THAT SHAPES EVERY QUERY HERE
-- ---------------------------------------------------------------------------
-- Demographics exist only on `users`. Anonymous play stores nothing
-- identifying and never will: sessions carry a country code, a coarse device
-- bucket and a salted user-agent hash, and that is the whole of it.
--
-- So any demographic cut here is implicitly restricted to SIGNED-IN players
-- who chose to fill in an optional profile field. That is a self-selected
-- subset of a self-selected subset, and it is not a sample of the public.
-- Nothing in this file should ever be reported as "Americans think X" or
-- "under-30s think Y" without that sentence attached.
--
-- Everything is self-reported and unverified. birth_year is a number someone
-- typed. city and state come from a fixed list of the 1,000 largest US cities
-- (lib/geo/us-places.json), so there is no path from free text to an accepted
-- value, but a real person can still pick the wrong one.
--
-- ---------------------------------------------------------------------------
-- MINIMUM CELL SIZE
-- ---------------------------------------------------------------------------
-- Every section below applies a HAVING floor. Not a statistical nicety: with a
-- small user base, a city cell can easily contain exactly one person, and
-- publishing "respondents in Boise underestimated X" when Boise is one
-- identifiable individual is a privacy failure as much as a statistical one.
-- Raise these floors before publishing anything, never lower them.


-- ---------------------------------------------------------------------------
-- 1. Who is even in the sample
--
-- Read this before anything else in the file. If `with_birth_year` is small,
-- every age result below is noise.
-- ---------------------------------------------------------------------------
select
  count(*)                                                            as users_total,
  count(*) filter (where birth_year is not null)                      as with_birth_year,
  count(*) filter (where state is not null)                           as with_state,
  count(*) filter (where city is not null)                            as with_city,
  count(distinct state)                                               as distinct_states,
  count(distinct city || ', ' || state)                               as distinct_cities,
  count(*) filter (where blocked_at is not null)                      as blocked,
  min(birth_year)                                                     as oldest_birth_year,
  max(birth_year)                                                     as youngest_birth_year
from users;


-- ---------------------------------------------------------------------------
-- 2. Divergence by age band
--
-- Age is computed from birth_year against the current year, so it drifts by up
-- to a year for any individual. Bands are wide enough that this does not
-- matter; do not narrow them to single years, because the input does not
-- support that precision.
-- ---------------------------------------------------------------------------
with aged as (
  select
    g.mean_abs_error,
    g.mean_signed_error,
    g.score,
    g.dataset_id,
    (extract(year from now())::int - u.birth_year)                    as age
  from guesses g
  join users u on u.id = g.user_id
  where not g.is_suspect and u.birth_year is not null
)
select
  case
    when age < 25 then 'a. under 25'
    when age < 35 then 'b. 25 to 34'
    when age < 45 then 'c. 35 to 44'
    when age < 55 then 'd. 45 to 54'
    when age < 65 then 'e. 55 to 64'
    else               'f. 65 and over'
  end                                                                 as age_band,
  count(*)                                                            as n,
  count(distinct dataset_id)                                          as questions,
  round(avg(mean_abs_error)::numeric, 4)                              as mean_abs_err,
  round(percentile_cont(0.5) within group (order by mean_abs_error)::numeric, 4)
                                                                      as median_abs_err,
  round(avg(mean_signed_error)::numeric, 4)                           as mean_signed_err,
  round(avg(score)::numeric, 1)                                       as mean_score
from aged
group by age_band
having count(*) >= 20
order by age_band;


-- ---------------------------------------------------------------------------
-- 3. Divergence by state
-- ---------------------------------------------------------------------------
select
  u.state,
  count(distinct u.id)                                                as respondents,
  count(*)                                                            as n,
  count(distinct g.dataset_id)                                        as questions,
  round(avg(g.mean_abs_error)::numeric, 4)                            as mean_abs_err,
  round(avg(g.mean_signed_error)::numeric, 4)                         as mean_signed_err,
  round(avg(g.score)::numeric, 1)                                     as mean_score
from guesses g
join users u on u.id = g.user_id
where not g.is_suspect and u.state is not null
group by u.state
-- Both floors matter: 20 responses could all come from one person, and one
-- person is not a state.
having count(*) >= 20 and count(distinct u.id) >= 5
order by n desc;


-- ---------------------------------------------------------------------------
-- 4. Age effect CONTROLLED FOR QUESTION
--
-- Sections 2 and 3 are confounded by which charts each group happened to
-- answer, and chart order is randomised per user, so the groups will not have
-- overlapping question sets.
--
-- This compares each response against the mean for its OWN chart, then
-- averages those deviations by age band. A positive `deviation_from_chart_mean`
-- means that band was worse than typical on the same questions. Only charts
-- with enough responses to have a meaningful mean are included.
-- ---------------------------------------------------------------------------
with chart_means as (
  select
    dataset_id,
    avg(mean_abs_error)                                               as chart_mean_err,
    count(*)                                                          as chart_n
  from guesses
  where not is_suspect
  group by dataset_id
),
aged as (
  select
    g.dataset_id,
    g.mean_abs_error,
    (extract(year from now())::int - u.birth_year)                    as age
  from guesses g
  join users u on u.id = g.user_id
  where not g.is_suspect and u.birth_year is not null
)
select
  case
    when a.age < 25 then 'a. under 25'
    when a.age < 35 then 'b. 25 to 34'
    when a.age < 45 then 'c. 35 to 44'
    when a.age < 55 then 'd. 45 to 54'
    when a.age < 65 then 'e. 55 to 64'
    else                 'f. 65 and over'
  end                                                                 as age_band,
  count(*)                                                            as n,
  round(avg(a.mean_abs_error - cm.chart_mean_err)::numeric, 4)        as deviation_from_chart_mean,
  round(stddev_samp(a.mean_abs_error - cm.chart_mean_err)::numeric, 4) as stddev_of_deviation
from aged a
join chart_means cm on cm.dataset_id = a.dataset_id and cm.chart_n >= 10
group by age_band
having count(*) >= 20
order by age_band;


-- ---------------------------------------------------------------------------
-- 5. Profile completeness
--
-- Not a finding about the world, a finding about the signup form. If almost
-- nobody fills in a field, that field cannot carry analysis and the form is
-- asking for something it never uses. Either make it matter or drop it.
-- ---------------------------------------------------------------------------
select
  'birth_year'                                                        as field,
  count(*) filter (where birth_year is not null)                      as filled,
  count(*)                                                            as total,
  round(100.0 * count(*) filter (where birth_year is not null) / nullif(count(*), 0), 1)
                                                                      as pct_filled
from users
union all
select 'state', count(*) filter (where state is not null), count(*),
       round(100.0 * count(*) filter (where state is not null) / nullif(count(*), 0), 1)
from users
union all
select 'city', count(*) filter (where city is not null), count(*),
       round(100.0 * count(*) filter (where city is not null) / nullif(count(*), 0), 1)
from users
union all
select 'email_verified', count(*) filter (where email_verified_at is not null), count(*),
       round(100.0 * count(*) filter (where email_verified_at is not null) / nullif(count(*), 0), 1)
from users;
