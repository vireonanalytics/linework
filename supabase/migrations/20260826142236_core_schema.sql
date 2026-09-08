-- Draw the Line - core schema.
--
-- Two principles run through this file:
--
-- 1. NO PII, EVER. No raw IPs, no raw user agents. Only salted hashes and
--    coarse buckets. There is no column here that could be walked back to a
--    person, and there must never be one.
--
-- 2. The guarantees the build gates make are ALSO made here. An unverified
--    dataset cannot be active, x and y must be the same length, a path must be
--    the length it claims and hold values in range. Application code can be
--    bypassed; a check constraint cannot.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

-- CHECK constraints cannot contain subqueries, so range-checking an array
-- needs an immutable function.
create or replace function path_values_in_range(p smallint[])
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select bool_and(v between 0 and 1000) from unnest(p) as v;
$$;

comment on function path_values_in_range(smallint[]) is
  'True when every element is a valid quantised path value (0..1000).';

-- ---------------------------------------------------------------------------
-- datasets
-- ---------------------------------------------------------------------------

create table datasets (
  id                bigint generated always as identity primary key,
  slug              text        not null unique,
  title             text        not null,
  question          text        not null,
  y_label           text        not null,
  y_unit            text        not null,
  x_values          jsonb       not null,
  y_values          jsonb       not null,
  reveal_from_index integer     not null,
  y_domain_min      double precision not null,
  y_domain_max      double precision not null,
  source_name       text        not null,
  source_url        text        not null,
  methodology_note  text,
  published_at      timestamptz,
  is_active         boolean     not null default false,

  -- Not in the original schema sketch, but the integrity guard is meaningless
  -- if the database cannot express it.
  verified          boolean     not null default false,
  verified_on       date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint datasets_slug_is_url_safe
    check (slug ~ '^[a-z0-9-]+$'),

  -- The production gate, in the database. Unverified data cannot be served.
  constraint datasets_active_requires_verified
    check (not is_active or verified),

  constraint datasets_verified_needs_a_date
    check (verified = (verified_on is not null)),

  constraint datasets_series_are_arrays
    check (jsonb_typeof(x_values) = 'array' and jsonb_typeof(y_values) = 'array'),

  -- The same rule scripts/validate-datasets.ts enforces at build time.
  constraint datasets_series_lengths_match
    check (jsonb_array_length(x_values) = jsonb_array_length(y_values)),

  -- There has to be something revealed and something left to draw.
  constraint datasets_reveal_index_leaves_room
    check (reveal_from_index between 1 and jsonb_array_length(y_values) - 2),

  constraint datasets_domain_ascends
    check (y_domain_max > y_domain_min)
);

comment on table datasets is
  'One row per chart. y_values is the truth; never serve a row with is_active false.';
comment on column datasets.verified is
  'A human checked every value against the primary source. See data/SOURCES.md.';

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

create table sessions (
  id            uuid        primary key,
  created_at    timestamptz not null default now(),

  -- Two-letter country from the edge, never a coordinate and never an IP.
  country       text,
  device_type   text,
  -- Host only. Never a full referring URL, which can carry query parameters.
  referrer_host text,
  -- Salted SHA-256 of the user agent. The raw string is never stored.
  ua_hash       text,

  is_suspect    boolean     not null default false,

  constraint sessions_country_is_iso2
    check (country is null or country ~ '^[A-Z]{2}$'),

  constraint sessions_device_type_known
    check (device_type is null or device_type in ('mobile', 'tablet', 'desktop', 'unknown'))
);

comment on table sessions is
  'Anonymous. No auth, no PII. Created on first guess, keyed by an httpOnly cookie.';
comment on column sessions.ua_hash is
  'Salted hash. Storing the raw user agent is forbidden.';

-- ---------------------------------------------------------------------------
-- guesses
-- ---------------------------------------------------------------------------

create table guesses (
  id                bigint generated always as identity primary key,
  session_id        uuid        not null references sessions(id) on delete cascade,
  dataset_id        bigint      not null references datasets(id) on delete restrict,
  created_at        timestamptz not null default now(),

  -- 40 points, y quantised to integers 0..1000.
  path              smallint[]  not null,
  path_resolution   smallint    not null,

  order_in_session  smallint    not null,
  draw_ms           integer     not null,
  redraw_count      smallint    not null,
  viewport_w        integer     not null,

  -- Always recomputed server-side. A client-submitted score is never stored.
  score             smallint    not null,
  mean_abs_error    double precision not null,
  -- The most important column in the database: absolute error says people are
  -- wrong, signed error says which direction, and that is the finding.
  mean_signed_error double precision not null,

  is_suspect        boolean     not null default false,
  -- Without this you can never audit why a row was excluded from a published
  -- aggregate. An unexplained exclusion is not a defensible one.
  suspect_reasons   text[]      not null default '{}',

  constraint guesses_path_matches_declared_resolution
    check (array_length(path, 1) = path_resolution),

  constraint guesses_path_resolution_is_sane
    check (path_resolution between 2 and 1000),

  constraint guesses_path_values_in_range
    check (path_values_in_range(path)),

  constraint guesses_score_is_a_percentage
    check (score between 0 and 100),

  constraint guesses_errors_are_unit_scaled
    check (mean_abs_error between 0 and 1 and mean_signed_error between -1 and 1),

  constraint guesses_counters_are_not_negative
    check (draw_ms >= 0 and redraw_count >= 0 and order_in_session >= 1),

  constraint guesses_viewport_is_plausible
    check (viewport_w between 1 and 20000),

  constraint guesses_suspect_matches_reasons
    check (is_suspect = (array_length(suspect_reasons, 1) is not null))
);

comment on table guesses is
  'One drawn path. Flagged rows are stored but excluded from every published aggregate.';

-- Phase 4 reads clean guesses for one dataset. This is that query.
create index guesses_clean_by_dataset
  on guesses (dataset_id, created_at desc)
  where not is_suspect;

-- Duplicate detection and order_in_session both walk a session's history.
create index guesses_by_session
  on guesses (session_id, dataset_id);

-- ---------------------------------------------------------------------------
-- rate limiting
-- ---------------------------------------------------------------------------

-- Serverless functions share no memory, so the counter has to live somewhere
-- both instances can see. The bucket key is a salted hash plus a window stamp,
-- so this table holds no address either.
create table rate_limit (
  bucket     text        primary key,
  hits       integer     not null default 1,
  expires_at timestamptz not null
);

create index rate_limit_expiry on rate_limit (expires_at);

comment on table rate_limit is
  'Fixed-window counters. Rows are disposable and hold no identifying data.';

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger datasets_touch_updated_at
  before update on datasets
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
--
-- Supabase publishes every table through PostgREST on the public internet,
-- reachable with the anon key. RLS is enabled here with NO policies, which
-- denies all access through that path. The application connects with the
-- service role over a direct Postgres connection, which bypasses RLS.
--
-- If a future phase needs public read access to aggregates, it gets an
-- explicit policy on an aggregate VIEW that already excludes suspect rows -
-- never a policy on these tables.

alter table datasets   enable row level security;
alter table sessions   enable row level security;
alter table guesses    enable row level security;
alter table rate_limit enable row level security;

-- Deliberately NOT "force row level security". Forcing applies RLS to the
-- table owner as well, and the application connects as the owner, so forcing
-- would lock out our own writes. Enabling is enough for the threat this
-- addresses: the anon and authenticated roles are not owners, so with zero
-- policies they get nothing.

-- Defence in depth. Supabase grants the API roles broad access to new tables
-- in public by default; RLS already denies them, and these revokes mean a
-- future policy added by accident still would not expose anything.
revoke all on table datasets   from anon, authenticated;
revoke all on table sessions   from anon, authenticated;
revoke all on table guesses    from anon, authenticated;
revoke all on table rate_limit from anon, authenticated;
