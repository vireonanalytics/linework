-- A record of every send attempt and what happened to it.
--
-- WHY THIS EXISTS. Password reset failed silently three times in a row during
-- development and there was no way to tell why from inside the product. The
-- send was rejected by the provider, the rejection went to a server log
-- nobody reads, and every user-facing surface said the same reassuring thing
-- it says on success - because /password/forgot MUST answer identically in
-- every case or it becomes an account-enumeration oracle.
--
-- That guarantee is worth keeping, but it means "nothing arrived" is
-- indistinguishable from "everything worked" to the only person who could act
-- on the difference. This table is where the difference lives: the user still
-- sees the same neutral message, and an admin can see what actually happened.
--
-- It is a DIAGNOSTIC, not an archive. No message body, no token, no link -
-- only that an attempt was made, of what kind, and whether the provider took
-- it. A body would put live reset links in a table, which is exactly what
-- storing only token hashes was meant to avoid.
--
-- The recipient IS stored in full. That is a deliberate exception to this
-- project's usual instinct to hash: an admin debugging "I never got the
-- email" needs to see which address was tried, and `users.email` already
-- holds the same value, so this introduces no new category of data. It is
-- account data, entirely separate from the anonymous guess pipeline, which
-- still holds nothing identifying.

create table if not exists email_log (
  id          bigserial primary key,
  to_email    text not null,
  kind        text not null,
  ok          boolean not null,
  -- The provider's own words when it refused. This is the field that would
  -- have answered the question immediately.
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists email_log_created_idx on email_log (created_at desc);

-- Same RLS posture as every other table here: on, no policies, explicit
-- revoke, so PostgREST exposes nothing.
alter table email_log enable row level security;
revoke all on email_log from anon, authenticated;
revoke all on sequence email_log_id_seq from anon, authenticated;

comment on table email_log is
  'Diagnostic record of outbound mail attempts: recipient, kind, and whether '
  'the provider accepted it. Never stores a body, a link or a token.';
