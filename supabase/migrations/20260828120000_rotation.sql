-- Which active charts are currently being SERVED to players.
--
-- Requested 2026-08-28, for launch: concentrate answers on a small pool so
-- charts actually reach CROWD_MIN_N (50) and the crowd view switches on.
-- With 275 charts in rotation that needs ~2,750 players; with 50 it needs
-- ~500, which one good post can deliver.
--
-- ---------------------------------------------------------------------------
-- WHY NOT REUSE retired_at, AND WHY NOT is_active
-- ---------------------------------------------------------------------------
-- Both would have worked mechanically and both would have been a lie.
--
-- retired_at means WITHDRAWN: the import no longer produces this chart, or an
-- admin took it out of circulation. Held-back charts are the opposite - they
-- are good, verified, and expected back shortly. Filing 225 of them under
-- "Retired charts" would bury the archive of genuinely dead charts under a
-- pile of live ones, and make the one screen an admin uses to find a withdrawn
-- chart useless.
--
-- is_active means SERVABLE AT ALL, and it is what the guess and crowd routes
-- gate on, what the datasets_active_requires_verified constraint protects, and
-- what "Your answers" filters by. Setting it false would have hidden every
-- already-answered held-back chart from the player who answered it, and made
-- shared links 403. None of that is wanted.
--
-- So this is a third, deliberately narrow thing: in_rotation controls ONLY
-- what the queue hands out next. A held-back chart stays active, stays
-- playable by direct link, stays in everyone's history, and comes back with
-- one UPDATE.

alter table datasets
  add column if not exists in_rotation boolean not null default true;

-- The queue filters on (is_active and in_rotation) for one user at a time, so
-- the partial index matches the query rather than the column.
create index if not exists datasets_rotation_idx
  on datasets (id) where is_active and in_rotation;

comment on column datasets.in_rotation is
  'Whether nextChartForUser may hand this chart out. Held-back charts (false) '
  'are still active, still playable by direct link, and still appear in the '
  'history of anyone who answered them - this only narrows the queue. '
  'Distinct from retired_at, which means withdrawn.';
