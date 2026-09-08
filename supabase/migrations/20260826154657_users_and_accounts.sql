-- Draw the Line - accounts, roles, streaks.
--
-- This migration is the one place this project stops being able to say
-- "no PII, ever." Up to now that promise was absolute, because every table
-- held only anonymous, hashed, or coarsely-bucketed data. Accounts change
-- that on purpose: email and a display name are what "sign in" means, and
-- there is no way around collecting them.
--
-- What does NOT change: the anonymous pipeline. guesses.session_id and
-- sessions stay exactly as they are, still fully anonymous, still hashed
-- where they touch anything identifying. guesses.user_id (added below) is an
-- ADDITIONAL, nullable link - a logged-in guess carries both a session_id
-- and a user_id, an anonymous guess carries only the former. Neither
-- replaces the other; see SCHEMA.md.
--
-- What is collected, deliberately minimal, and why each field exists:
--   email            - login. Required. Real PII, disclosed as such.
--   display_name     - NOT legal name. Shown publicly if this project ever
--                       shows usernames anywhere; nothing else here is.
--   birth_year       - NOT full date of birth. Enough for age-bucket
--                       analysis (e.g. "how does perception of this trend
--                       differ by generation"), nowhere near enough to
--                       identify a birthday.
--   city / state     - self-reported, validated against a real bundled
--                       place list (lib/geo/places.ts), not free text.
--                       US only; every other user gets NULL here.
--   country          - AUTO-DETECTED from the request, not typed in. Same
--                       coarse two-letter-code pattern sessions.country
--                       already uses.
--   location_mismatch_flag - set when a user enters a US city/state while
--                       their detected country is not US. Soft-flagged, not
--                       blocked - stored so location-based findings can
--                       exclude it by default, never used to reject signup.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create table users (
  -- Generated in application code via crypto.randomUUID(), the same pattern
  -- sessions.id already uses - no gen_random_uuid()/pgcrypto dependency.
  id                     uuid        primary key,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  email                  text        not null unique,
  -- Null until the person completes signup and sets one - this is what lets
  -- the admin seed script pre-create a row (see scripts/seed-admin.ts)
  -- before that person has ever signed up.
  password_hash          text,

  display_name           text        not null,

  -- Self-reported demographics. Every one of these is UNVERIFIED - the
  -- methodology page says so plainly. This column exists so the app can too:
  -- nothing downstream should present these as verified facts.
  birth_year             smallint,
  city                   text,
  state                  text,
  country                text,
  location_mismatch_flag boolean     not null default false,

  -- Not a hardcoded email check anywhere in application code - this column
  -- is the only place adminhood lives. scripts/seed-admin.ts sets it for
  -- exactly one row; every route that gates on "admin" reads this.
  role                   text        not null default 'user',

  current_streak         smallint    not null default 0,
  longest_streak         smallint    not null default 0,
  last_active_date       date,
  -- Earned via streak milestones (see lib/streak/compute.ts), never sold -
  -- there is no payment integration in this project. "Purchasable" freezes
  -- would need a payment provider, which is a real business/legal decision
  -- this migration does not make.
  streak_freezes_available smallint  not null default 0,

  constraint users_email_is_lowercase
    check (email = lower(email)),
  constraint users_email_looks_like_an_email
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint users_display_name_is_reasonable
    check (char_length(display_name) between 1 and 40),
  constraint users_birth_year_is_plausible
    check (birth_year is null or birth_year between 1900
           and extract(year from now())::int - 5),
  constraint users_role_is_known
    check (role in ('user', 'admin')),
  constraint users_streak_fields_not_negative
    check (current_streak >= 0 and longest_streak >= 0
           and streak_freezes_available >= 0),
  -- The longest streak on record can never be less than the current one -
  -- if it ever is, the update logic that maintains both has a bug.
  constraint users_longest_streak_at_least_current
    check (longest_streak >= current_streak),
  -- state is validated against lib/geo/us-states.ts in application code
  -- (a CHECK constraint can't reach a TypeScript module), but city/state can
  -- only ever both be null or both be set, which the database CAN enforce -
  -- a lone city or a lone state is a bug, not a valid partial answer.
  constraint users_city_and_state_travel_together
    check ((city is null) = (state is null))
);

comment on table users is
  'Accounts. The only table in this schema that holds real PII - see the file header.';
comment on column users.role is
  'Admin status lives here, in the database, and nowhere else. Never a hardcoded email check.';
comment on column users.birth_year is
  'Self-reported, unverified. Age-bucket analysis only - never full date of birth.';

create trigger users_touch_updated_at
  before update on users
  for each row execute function touch_updated_at();

alter table users enable row level security;
revoke all on table users from anon, authenticated;

-- ---------------------------------------------------------------------------
-- guesses: link to a logged-in user, without replacing the anonymous session
-- ---------------------------------------------------------------------------

alter table guesses
  add column user_id uuid references users(id) on delete set null;

comment on column guesses.user_id is
  'Set when the player was logged in. Nullable and additional - session_id stays the anonymous identity either way. Deleting a user detaches this rather than deleting the guess: the drawn path is research data independent of who drew it.';

create index guesses_by_user on guesses (user_id) where user_id is not null;
