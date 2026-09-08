-- Per-dataset reliability rating.
--
-- Requested 2026-08-27: "mark every chart you check or upload with a colorful
-- reliability level (green, yellow, red)".
--
-- What each level MEANS is the important part, and it is written down here
-- rather than left to whoever reads the colour:
--
--   green  - Values were fetched programmatically from a primary or
--            near-primary source (World Bank / UN / WHO / national
--            statistical office) and are the SOURCE'S OWN NUMBERS, not
--            interpolated, smoothed or reconstructed. The fetch is
--            reproducible: re-running the importer against the recorded
--            indicator code returns the same series.
--
--   yellow - Real, sourced data with a named caveat: a series stitched from
--            more than one release, a definition that changed mid-series, a
--            source that is respected but secondary, or a gap that had to be
--            handled. Publishable, but a finding built on it should carry
--            the caveat forward.
--
--   red    - Values are approximated, reconstructed from a handful of anchor
--            points, or the provenance could not be confirmed. NOT
--            publishable. New charts are never imported at this level; it
--            exists to describe charts that predate this system honestly
--            rather than quietly relabelling them.
--
-- Deliberately NOT defaulted to green. A row that has never been assessed is
-- 'red' - unassessed and unpublishable are the same thing here, and a
-- default of green would silently bless every future insert.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'reliability_level') then
    create type reliability_level as enum ('green', 'yellow', 'red');
  end if;
end
$$;

alter table datasets
  add column if not exists reliability reliability_level not null default 'red',
  -- Why this rating. Required for yellow and red so a caveat is never a bare
  -- colour; the same pairing rule blocked_reason and suspect_reasons follow.
  add column if not exists reliability_note text,
  -- Where the numbers actually came from, machine-readably. For imported
  -- series this is the indicator code, which is what makes the fetch
  -- reproducible and the rating checkable by someone other than me.
  add column if not exists source_series_id text,
  add column if not exists source_fetched_at timestamptz;

-- Backfill BEFORE adding the constraint. Every pre-existing row defaults to
-- 'red' with no note, which the constraint below correctly refuses - the
-- first attempt to apply this migration failed on exactly that, and the
-- failure was the constraint doing its job. These 21 charts are genuinely
-- red: their values are piecewise-linear interpolations between a handful of
-- real anchor points (see lib/datasets/interpolate.ts), which is the textbook
-- definition of "reconstructed" and has been flagged in LAUNCH_CHECKLIST.md
-- since Session 5.
update datasets
set reliability_note = 'Values are piecewise-linear interpolations between a '
                       'small number of real, sourced anchor points, not the '
                       'source''s own annual series. Predates the reliability '
                       'system; rate again after re-importing exact values.'
where reliability_note is null and reliability <> 'green';

alter table datasets drop constraint if exists datasets_reliability_has_note;
alter table datasets
  add constraint datasets_reliability_has_note
  check (
    reliability = 'green'
    or (reliability_note is not null and char_length(reliability_note) between 1 and 600)
  );

create index if not exists datasets_reliability_idx on datasets (reliability);

comment on column datasets.reliability is
  'green = source''s own numbers, reproducibly fetched. yellow = real and '
  'sourced but carries a named caveat. red = approximated or unconfirmed, '
  'not publishable. Unassessed rows are red by default, never green.';
