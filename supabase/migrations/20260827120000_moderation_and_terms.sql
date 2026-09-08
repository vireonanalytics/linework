-- Moderation, terms acceptance, and low-effort tracking.
--
-- Four capabilities, all requested 2026-08-27:
--
--   * blocking a user (admin action, must survive an already-issued JWT)
--   * flagging a user for review without blocking them
--   * counting deliberate junk submissions so a warning can escalate
--   * recording that someone agreed to the terms, and when
--
-- Everything here hangs off `users`. There is deliberately no equivalent for
-- the anonymous pipeline: an anonymous player has no durable identity to
-- block, and inventing one would mean storing something identifying, which
-- the whole anonymous design exists to avoid. Anonymous abuse is handled by
-- rate limiting and suspect-flagging instead.

alter table users
  -- Set = blocked. A timestamp rather than a boolean because "when" is the
  -- first thing anyone asks when reviewing a moderation decision, and a
  -- boolean throws that away.
  add column if not exists blocked_at      timestamptz,
  add column if not exists blocked_reason  text,

  -- Flagged for a human to look at, but still able to play. Separate from
  -- blocked on purpose: most flags should be reviewed, not enforced, and
  -- collapsing the two would push an admin toward blocking when unsure.
  add column if not exists flagged_at      timestamptz,
  add column if not exists flagged_reason  text,

  -- How many times this account has submitted a guess the server judged to
  -- be deliberate junk (see lib/server/low-effort.ts). Drives the in-game
  -- warning and, past a threshold, an automatic flag.
  add column if not exists low_effort_strikes smallint not null default 0,

  -- Null for accounts created before terms acceptance was required. Not
  -- back-filled: pretending an older account agreed to something it was
  -- never shown would make this column useless as evidence.
  add column if not exists terms_accepted_at timestamptz;

-- A reason is required to block, and meaningless without a block. Same
-- pairing rule guesses.is_suspect/suspect_reasons already uses: a moderation
-- action with no recorded reason cannot be reviewed or defended later.
alter table users
  drop constraint if exists users_block_has_reason;
alter table users
  add constraint users_block_has_reason
  check (
    (blocked_at is null and blocked_reason is null)
    or (blocked_at is not null and blocked_reason is not null
        and char_length(blocked_reason) between 1 and 500)
  );

alter table users
  drop constraint if exists users_flag_has_reason;
alter table users
  add constraint users_flag_has_reason
  check (
    (flagged_at is null and flagged_reason is null)
    or (flagged_at is not null and flagged_reason is not null
        and char_length(flagged_reason) between 1 and 500)
  );

alter table users
  drop constraint if exists users_strikes_not_negative;
alter table users
  add constraint users_strikes_not_negative
  check (low_effort_strikes >= 0);

-- The admin user list sorts by these, and the guess path checks blocked_at on
-- every submission by a signed-in player. Partial indexes because the vast
-- majority of rows are null on both and there is no reason to index those.
create index if not exists users_blocked_at_idx
  on users (blocked_at desc) where blocked_at is not null;

create index if not exists users_flagged_at_idx
  on users (flagged_at desc) where flagged_at is not null;

comment on column users.blocked_at is
  'Set when an admin blocks this account. Enforced on every guess, not just '
  'at sign-in, because a JWT issued before the block stays cryptographically '
  'valid until it expires.';

comment on column users.low_effort_strikes is
  'Count of guesses judged deliberate junk. Drives an in-game warning and an '
  'automatic review flag. Never auto-blocks - blocking stays a human decision.';
