-- Mark imported datasets the catalogue no longer produces, so that
-- "activate everything green" cannot resurrect them.
--
-- WHY THIS EXISTS. The 2026-08-27 catalogue rewrite replaced 331 imported
-- charts with 275 different ones. The seed script deactivated the 289 that
-- were dropped - and then the admin bulk action `activateGreenDatasets()`
-- turned all 289 straight back on, because they are still green, still
-- imported, and still not active, which is exactly the condition that
-- function activates on. 564 charts went live instead of 275.
--
-- The root cause is that `is_active = false` is ambiguous. It means both
-- "not yet reviewed" and "deliberately withdrawn", and the bulk action can
-- only see the first reading. Ordering the seed and the activation
-- differently would have hidden the bug rather than fixed it: an admin
-- clicking the button a week later would still resurrect them.
--
-- retired_at makes the second reading explicit and durable. It is set by the
-- seed when a slug leaves the catalogue, and cleared when a slug returns, so
-- re-adding an indicator to wb-catalogue.ts brings its chart back normally.
--
-- NOT a deletion, and deliberately not a cascade. A retired chart keeps every
-- guess ever recorded against it - those guesses are this project's entire
-- research output, and a dataset going out of circulation is not a reason to
-- destroy the answers people gave it.

alter table datasets
  add column if not exists retired_at timestamptz;

-- A retired dataset must not be served. Enforced in the database rather than
-- trusted to application code, for the same reason
-- datasets_active_requires_verified is: the bulk action that caused this bug
-- WAS application code, and it was wrong.
alter table datasets drop constraint if exists datasets_retired_not_active;
alter table datasets
  add constraint datasets_retired_not_active
  check (retired_at is null or is_active = false);

create index if not exists datasets_retired_idx on datasets (retired_at)
  where retired_at is not null;

comment on column datasets.retired_at is
  'Set when an imported dataset leaves scripts/wb-catalogue.ts. Distinguishes '
  '"deliberately withdrawn" from "not yet activated", which is_active alone '
  'cannot express. Bulk activation skips these; guesses are preserved.';
