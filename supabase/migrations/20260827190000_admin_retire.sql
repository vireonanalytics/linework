-- Let an admin take a chart out of circulation, and record who decided.
--
-- Requested 2026-08-27: "give admins a right to delete or as you call it
-- deactivate the charts".
--
-- WHY A REASON COLUMN AND NOT JUST retired_at.
--
-- retired_at already existed, but it meant exactly one thing: "the import
-- catalogue no longer produces this slug". The seed OWNS that state - it sets
-- it when a slug leaves scripts/wb-catalogue.ts and CLEARS it when the slug
-- comes back, so re-adding an indicator restores its chart.
--
-- An admin decision cannot share that column unqualified. A chart the admin
-- retired is, by definition, usually still in the catalogue - so the very next
-- `npm run seed` would clear the mark, and the next bulk activation would put
-- the chart back in front of players. The admin's decision would silently
-- expire.
--
-- retired_reason says whose decision it was, so the seed can clear only its
-- own. 'catalogue' is reversible by re-importing; 'admin' is reversible only
-- by an admin.
--
-- STILL NOT A DELETE. The request said "delete or as you call it deactivate",
-- and deactivate is what this does. Every guess recorded against a retired
-- chart is preserved - those guesses are this project's entire research
-- output, and taking a chart out of circulation is not a reason to destroy
-- the answers people already gave it. A real DELETE would either cascade them
-- away or fail on the foreign key.

alter table datasets
  add column if not exists retired_reason text;

-- Backfill before constraining: every existing retirement came from the
-- catalogue rewrite, because that is the only thing that could have set it.
update datasets
set retired_reason = 'catalogue'
where retired_at is not null and retired_reason is null;

alter table datasets drop constraint if exists datasets_retired_reason_valid;
alter table datasets
  add constraint datasets_retired_reason_valid
  check (retired_reason is null or retired_reason in ('catalogue', 'admin'));

-- The two columns describe one fact and must not disagree. A retired_at with
-- no reason is unauditable; a reason with no timestamp is a chart that claims
-- to be retired while still being served.
alter table datasets drop constraint if exists datasets_retired_pair;
alter table datasets
  add constraint datasets_retired_pair
  check ((retired_at is null) = (retired_reason is null));

comment on column datasets.retired_reason is
  '''catalogue'' = the slug left scripts/wb-catalogue.ts; cleared automatically '
  'when it returns. ''admin'' = a human took it out of circulation; the seed '
  'must never clear this, or the decision would expire on the next import.';
