-- Draw the Line - crowd aggregation.
--
-- Percentiles and a render sample are PRECOMPUTED on a schedule via pg_cron,
-- never on request. The read path is a plain SELECT against these tables -
-- no aggregation, no unnest, nothing that scales with guess count sits
-- between a page view and a response.
--
-- Mechanism: pg_cron, running inside this database. Chosen over a Vercel Cron
-- Job calling an API route because the aggregation is pure SQL over data that
-- already lives here - running it in-process avoids a network hop for what is
-- effectively a big GROUP BY, and keeps the "precompute" guarantee enforceable
-- by a database permission (recompute_crowd_stats() takes no input, so there
-- is no path for a request to trigger it early). If this project ever needs
-- the compute to happen outside Postgres (e.g. it grows expensive enough to
-- want a dedicated worker), the fallback is a Vercel Cron Job POSTing to a
-- protected route that runs `select recompute_crowd_stats();` over the same
-- connection app code already uses - the function itself does not change.

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- crowd_stats: five percentiles per (dataset, x-index)
-- ---------------------------------------------------------------------------
--
-- x_index is 0..39, the same resampled position every stored guess.path and
-- the truth's resampled series already share (see lib/scoring/score.ts). No
-- new coordinate system - a row here lines up with guesses.path[x_index]
-- exactly.
--
-- Percentiles are stored on the same 0..1000 quantised scale as guesses.path,
-- for the same reason guesses store quantised ints: one scale, everywhere,
-- so nothing needs renormalising to compare a percentile against a guess.

create table crowd_stats (
  dataset_id  bigint    not null references datasets(id) on delete cascade,
  x_index     smallint  not null,
  -- Unflagged guess count this dataset had at the last recompute. Same value
  -- on every row for a dataset - denormalised per-row so a read never needs a
  -- second query to apply the cold-start threshold.
  n           integer   not null,
  p10         smallint  not null,
  p25         smallint  not null,
  p50         smallint  not null,
  p75         smallint  not null,
  p90         smallint  not null,
  computed_at timestamptz not null default now(),

  primary key (dataset_id, x_index),

  constraint crowd_stats_x_index_in_range
    check (x_index between 0 and 999),
  constraint crowd_stats_n_not_negative
    check (n >= 0),
  constraint crowd_stats_percentiles_in_range
    check (p10 between 0 and 1000 and p25 between 0 and 1000 and
           p50 between 0 and 1000 and p75 between 0 and 1000 and
           p90 between 0 and 1000),
  -- Percentiles cannot cross. If they ever do, the aggregation query is
  -- broken and this constraint fails the write loudly instead of shipping a
  -- band that reads backwards on screen.
  constraint crowd_stats_percentiles_ordered
    check (p10 <= p25 and p25 <= p50 and p50 <= p75 and p75 <= p90)
);

comment on table crowd_stats is
  'Precomputed percentiles, refreshed on a schedule. Never written on request.';

alter table crowd_stats enable row level security;
revoke all on table crowd_stats from anon, authenticated;

-- ---------------------------------------------------------------------------
-- crowd_sample: a capped, refreshed sample of raw paths for the ink layer
-- ---------------------------------------------------------------------------
--
-- Percentiles alone cannot drive the Phase 2 ink-density rendering - that
-- effect comes from many individual translucent paths overlapping, not from
-- five summary lines. This table is that sample: up to CROWD_SAMPLE_SIZE
-- (see lib/crowd/constants.ts - kept in sync with the constant below by hand,
-- there is no automatic cross-check across the SQL/TypeScript boundary)
-- unflagged paths per dataset, refreshed at the same cadence as the
-- percentiles so both reflect the same moment.

create table crowd_sample (
  id          bigint generated always as identity primary key,
  dataset_id  bigint    not null references datasets(id) on delete cascade,
  path        smallint[] not null,
  computed_at timestamptz not null default now(),

  constraint crowd_sample_path_is_full_resolution
    check (array_length(path, 1) = 40)
);

comment on table crowd_sample is
  'A refreshed random sample of unflagged guess paths, for ink-density rendering. Not a source of truth for anything numeric - crowd_stats is.';

create index crowd_sample_by_dataset on crowd_sample (dataset_id);

alter table crowd_sample enable row level security;
revoke all on table crowd_sample from anon, authenticated;

-- ---------------------------------------------------------------------------
-- recompute
-- ---------------------------------------------------------------------------

create or replace function recompute_crowd_stats()
returns void
language plpgsql
as $$
declare
  -- Kept in sync by hand with CROWD_SAMPLE_SIZE in lib/crowd/constants.ts.
  sample_size constant integer := 500;
begin
  -- Percentiles. unnest(...) with ordinality turns each guess's 40-element
  -- path into 40 rows carrying their position, so grouping by (dataset,
  -- position) and taking percentile_cont per group produces exactly one row
  -- per x_index. Only unflagged guesses count, per the guardrail in
  -- docs/DESIGN.md: flagged rows are stored, never deleted, but never published.
  insert into crowd_stats (dataset_id, x_index, n, p10, p25, p50, p75, p90, computed_at)
  select
    counted.dataset_id,
    positioned.x_index,
    counted.n,
    round(percentile_cont(0.10) within group (order by positioned.value))::smallint,
    round(percentile_cont(0.25) within group (order by positioned.value))::smallint,
    round(percentile_cont(0.50) within group (order by positioned.value))::smallint,
    round(percentile_cont(0.75) within group (order by positioned.value))::smallint,
    round(percentile_cont(0.90) within group (order by positioned.value))::smallint,
    now()
  from (
    select g.id, g.dataset_id, u.value, u.ord - 1 as x_index
    from guesses g
    cross join lateral unnest(g.path) with ordinality as u(value, ord)
    where not g.is_suspect
  ) as positioned
  join (
    select dataset_id, count(*) as n
    from guesses
    where not is_suspect
    group by dataset_id
  ) as counted using (dataset_id)
  group by counted.dataset_id, counted.n, positioned.x_index
  on conflict (dataset_id, x_index) do update set
    n           = excluded.n,
    p10         = excluded.p10,
    p25         = excluded.p25,
    p50         = excluded.p50,
    p75         = excluded.p75,
    p90         = excluded.p90,
    computed_at = excluded.computed_at;

  -- A dataset that has since dropped below the threshold (every guess got
  -- flagged, say) should not keep showing stale bands from when it had more.
  delete from crowd_stats cs
  where not exists (
    select 1 from guesses g
    where g.dataset_id = cs.dataset_id and not g.is_suspect
  );

  -- Sample, refreshed from scratch each run rather than incrementally
  -- maintained - see the ceiling note in docs/DESIGN.md for when that stops being
  -- fine. TABLESAMPLE would be cheaper at large n but samples pages, not
  -- rows, so at today's scale plain random() is both simpler and accurate.
  delete from crowd_sample;

  insert into crowd_sample (dataset_id, path, computed_at)
  select dataset_id, path, now()
  from (
    select
      dataset_id,
      path,
      row_number() over (partition by dataset_id order by random()) as rn
    from guesses
    where not is_suspect
  ) as ranked
  where rn <= sample_size;
end;
$$;

comment on function recompute_crowd_stats() is
  'Scheduled by pg_cron. Recomputes crowd_stats and crowd_sample for every dataset from unflagged guesses.';

-- Every 15 minutes. Frequent enough that new guesses show up in the crowd
-- view within one Phase 6 session for someone who plays twice; infrequent
-- enough that recompute cost is a non-issue at the volumes this schema is
-- rated for (see the ceiling note in docs/DESIGN.md).
select cron.schedule(
  'recompute-crowd-stats',
  '*/15 * * * *',
  $$select recompute_crowd_stats();$$
);
