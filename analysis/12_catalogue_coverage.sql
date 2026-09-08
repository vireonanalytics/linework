-- 12_catalogue_coverage.sql
--
-- Which questions are earning their slot, and which are dead weight.
--
-- ---------------------------------------------------------------------------
-- THE FOUR STATES A CHART CAN BE IN
-- ---------------------------------------------------------------------------
-- These are separate columns because they mean separate things, and collapsing
-- any two of them has already caused a real bug in this project.
--
--   verified     a human checked the values against the primary source
--   is_active    servable at all: gates the guess and crowd API routes
--   in_rotation  the queue may hand it out (narrower than is_active)
--   retired_at   withdrawn, with retired_reason saying by whom
--
-- A held-back chart (is_active, not in_rotation) is still playable by direct
-- link and still appears in the history of anyone who answered it. A retired
-- chart is not served but keeps every guess ever recorded against it, because
-- those guesses are the research output and withdrawing a question is not a
-- reason to destroy the answers people already gave it.


-- ---------------------------------------------------------------------------
-- 1. Catalogue by state
-- ---------------------------------------------------------------------------
select
  case
    when d.retired_at is not null then 'retired (' || d.retired_reason || ')'
    when not d.verified           then 'unverified'
    when not d.is_active          then 'verified but inactive'
    when not d.in_rotation        then 'held back'
    else                               'in rotation'
  end                                                             as state,
  d.reliability,
  count(*)                                                        as charts,
  sum(a.total_n)                                                  as responses,
  count(*) filter (where a.clean_n > 0)                           as charts_with_responses,
  count(*) filter (where a.clean_n >= 50)                         as charts_at_threshold
from datasets d
left join lateral (
  select
    count(*)                                     as total_n,
    count(*) filter (where not g.is_suspect)     as clean_n
  from guesses g where g.dataset_id = d.id
) a on true
group by state, d.reliability
order by charts desc;


-- ---------------------------------------------------------------------------
-- 2. Charts in rotation that nobody has answered
--
-- Every one of these is occupying a slot in the queue and returning nothing.
-- If the list is long while total responses are low, the rotation is too wide:
-- answers are spreading instead of concentrating, and no chart will reach the
-- crowd threshold.
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  d.source_name,
  d.reliability,
  d.created_at::date                                              as added
from datasets d
where d.is_active
  and d.in_rotation
  and d.retired_at is null
  and not exists (select 1 from guesses g where g.dataset_id = d.id)
order by d.created_at, d.title;


-- ---------------------------------------------------------------------------
-- 3. Retired charts that still hold responses
--
-- Data that exists but is no longer being added to. Worth knowing before any
-- publication: a finding built on a retired chart is a finding about a
-- question nobody can answer any more, which needs saying out loud.
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  d.retired_at::date                                              as retired,
  d.retired_reason,
  count(g.id)                                                     as responses,
  count(g.id) filter (where not g.is_suspect)                     as clean,
  round(avg(g.mean_signed_error) filter (where not g.is_suspect)::numeric, 4)
                                                                  as mean_signed_err
from datasets d
join guesses g on g.dataset_id = d.id
where d.retired_at is not null
group by d.id, d.slug, d.title, d.retired_at, d.retired_reason
order by responses desc;


-- ---------------------------------------------------------------------------
-- 4. Provenance of what is actually being served
--
-- Two provenance mechanisms exist and they are checked differently. An
-- imported chart's paper trail is an API endpoint recorded in
-- source_series_id, which makes it reproducible: re-running the importer must
-- return the same numbers. A hand-authored chart's paper trail is a reviewed
-- row in data/SOURCES.md.
--
-- A chart rated green MUST carry a source_series_id, because green asserts
-- "here is how to check me" rather than "I am confident". A test fails the
-- build if that is ever violated; this is the same check against live data.
-- ---------------------------------------------------------------------------
select
  case when d.source_series_id is not null then 'imported (API)' else 'hand-authored' end
                                                                  as provenance,
  d.reliability,
  count(*)                                                        as charts,
  count(*) filter (where d.is_active and d.in_rotation)           as in_rotation,
  count(*) filter (where d.verified)                              as verified,
  sum(a.clean_n)                                                  as clean_responses
from datasets d
left join lateral (
  select count(*) filter (where not g.is_suspect) as clean_n
  from guesses g where g.dataset_id = d.id
) a on true
group by provenance, d.reliability
order by provenance, d.reliability;


-- ---------------------------------------------------------------------------
-- 5. Source concentration
--
-- How much of what gets served traces back to one organisation. A catalogue
-- where nearly everything comes from a single source is a catalogue with a
-- single point of failure, both for accuracy and for the credibility of any
-- published finding.
-- ---------------------------------------------------------------------------
select
  d.source_name,
  count(*)                                                        as charts,
  count(*) filter (where d.is_active and d.in_rotation)           as in_rotation,
  round(
    100.0 * count(*) filter (where d.is_active and d.in_rotation)
      / nullif(sum(count(*) filter (where d.is_active and d.in_rotation)) over (), 0), 1
  )                                                               as pct_of_rotation,
  sum(a.clean_n)                                                  as clean_responses
from datasets d
left join lateral (
  select count(*) filter (where not g.is_suspect) as clean_n
  from guesses g where g.dataset_id = d.id
) a on true
where d.retired_at is null
group by d.source_name
order by in_rotation desc, charts desc;


-- ---------------------------------------------------------------------------
-- 6. Are the charts in rotation actually interesting to draw?
--
-- A chart whose series barely moves after the reveal boundary is a bad
-- question: the honest answer is "a flat line", everyone draws it, everyone
-- scores well, and it measures nothing about belief.
--
-- `move_as_pct_of_axis` is how much of the y-axis the real series covers
-- between the boundary and the end. Small values are candidates for removal
-- from the rotation. The importer already rejects series that barely move, so
-- anything low here is likely hand-authored.
-- ---------------------------------------------------------------------------
select
  d.slug,
  d.title,
  round(
    (100.0 * abs(
       (d.y_values ->> (jsonb_array_length(d.y_values) - 1))::double precision
       - (d.y_values ->> d.reveal_from_index)::double precision
     ) / (d.y_domain_max - d.y_domain_min))::numeric, 1
  )                                                               as move_as_pct_of_axis,
  jsonb_array_length(d.y_values) - 1 - d.reveal_from_index        as points_to_draw,
  count(g.id) filter (where not g.is_suspect)                     as clean_n,
  round(avg(g.score) filter (where not g.is_suspect)::numeric, 1) as mean_score
from datasets d
left join guesses g on g.dataset_id = d.id
where d.is_active and d.in_rotation and d.retired_at is null
group by d.id, d.slug, d.title, d.y_values, d.y_domain_min, d.y_domain_max, d.reveal_from_index
order by move_as_pct_of_axis asc;
