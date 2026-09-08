-- Email verification and password reset.
--
-- Requested 2026-08-27: "implement the email processes for registration and
-- password change."
--
-- ---------------------------------------------------------------------------
-- ONLY THE HASH IS STORED, AND WHY IT IS A PLAIN SHA-256
-- ---------------------------------------------------------------------------
-- token_hash holds sha256(raw token). The raw token exists only in the email
-- that was sent; nothing in this database can reconstruct it. A dump of this
-- table therefore yields no working links - the same reasoning that makes
-- users.password_hash a hash rather than a password.
--
-- Unlike a password, this is a PLAIN sha256 with no salt and no pepper, and
-- that is deliberate rather than an oversight. Salting and key-stretching
-- exist to defeat brute force over a small, guessable input space. These
-- tokens are 32 bytes from crypto.randomBytes - 256 bits of uniform entropy,
-- with no dictionary to try and nothing to precompute. A rainbow table over
-- that space cannot exist. Peppering would also break the lookup, since the
-- token is FOUND by its hash rather than compared against a known row.
--
-- ---------------------------------------------------------------------------
-- SINGLE USE, AND SHORT LIVED
-- ---------------------------------------------------------------------------
-- consumed_at makes a token one-shot: a reset link that stays in an inbox (or
-- in a mail provider's logs, or a forwarded thread) must not remain a working
-- key to the account. expires_at bounds the window even if it is never used.
-- Verification gets 24 hours because people check mail late; a password reset
-- gets 1 hour because it is the more dangerous of the two.

alter table users
  -- Null = never confirmed. A timestamp rather than a boolean because "when"
  -- is the question asked in any later dispute about an account, and a
  -- boolean throws that away - same reasoning as blocked_at.
  add column if not exists email_verified_at timestamptz;

create table if not exists email_tokens (
  id           bigserial primary key,
  user_id      uuid not null references users(id) on delete cascade,
  purpose      text not null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),

  constraint email_tokens_purpose_valid
    check (purpose in ('verify_email', 'reset_password')),

  -- A token cannot be consumed before it was created. Cheap, and it catches
  -- a clock or code error that would otherwise be invisible.
  constraint email_tokens_consumed_after_created
    check (consumed_at is null or consumed_at >= created_at)
);

-- The lookup path: find a token by its hash. Unique already provides this;
-- named explicitly so the intent survives a future schema edit.
create index if not exists email_tokens_user_purpose_idx
  on email_tokens (user_id, purpose, consumed_at);

-- Sweeping expired rows. This table is disposable: every row is either
-- consumed, expired, or in flight for at most a day.
create index if not exists email_tokens_expires_idx on email_tokens (expires_at);

-- Same RLS posture as every other table here: enabled with zero policies and
-- an explicit revoke, so PostgREST exposes nothing even if a policy is ever
-- added by accident. The app reaches this table over the pooled Postgres
-- connection as the owner, exactly like guesses and datasets.
alter table email_tokens enable row level security;
revoke all on email_tokens from anon, authenticated;
revoke all on sequence email_tokens_id_seq from anon, authenticated;

comment on table email_tokens is
  'Single-use, expiring tokens for email verification and password reset. '
  'Stores sha256(token) only - the raw token exists solely in the sent email.';

comment on column users.email_verified_at is
  'When the address was confirmed by clicking the emailed link. Null means '
  'unverified: the account still plays normally (verification is a nudge, '
  'not a gate) but cannot reset its password.';
