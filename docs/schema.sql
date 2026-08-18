-- LocalKnows database schema
-- Postgres 15 / Supabase. Requires postgis and pg_trgm.

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------- geography

create table states (
  code            text primary key,          -- NSW, VIC
  name            text not null,
  slug            text not null unique
);

create table regions (
  id              uuid primary key default uuid_generate_v4(),
  state_code      text not null references states(code),
  name            text not null,             -- Riverina, Hume, Gippsland
  slug            text not null,
  boundary        geography(multipolygon,4326),
  tier            smallint not null default 3,
  unique (state_code, slug)
);

create table localities (
  id              uuid primary key default uuid_generate_v4(),
  region_id       uuid not null references regions(id),
  state_code      text not null references states(code),
  name            text not null,             -- Albury, Lavington, Yackandandah
  slug            text not null,
  postcode        text,
  centre          geography(point,4326) not null,
  tier            smallint not null default 3,   -- 1..4, drives page treatment
  population      integer,
  rolls_up_to     uuid references localities(id), -- tier 4 -> nearest tier 2/3
  is_indexable    boolean not null default false,
  unique (state_code, slug)
);

create index on localities using gist (centre);

-- neighbouring localities, powers the "nearby areas" internal link block
create table locality_neighbours (
  locality_id     uuid not null references localities(id) on delete cascade,
  neighbour_id    uuid not null references localities(id) on delete cascade,
  distance_km     numeric(6,2) not null,
  crosses_border  boolean not null default false,
  primary key (locality_id, neighbour_id)
);

-- ---------------------------------------------------------------- taxonomy

create type vertical as enum (
  'trades', 'eat_drink', 'pubs_clubs', 'stay', 'things_to_do', 'clubs_hobbies'
);

create table categories (
  id              uuid primary key default uuid_generate_v4(),
  vertical        vertical not null,
  parent_id       uuid references categories(id),
  name            text not null,             -- Plumbers
  name_singular   text not null,             -- Plumber
  slug            text not null unique,      -- plumbers
  schema_type     text not null,             -- Plumber, BarOrPub, Hotel
  description     text,
  sort_order      integer not null default 0
);

-- long tail modifiers: /nsw/albury/plumbers/emergency/
create table category_modifiers (
  id              uuid primary key default uuid_generate_v4(),
  category_id     uuid not null references categories(id) on delete cascade,
  slug            text not null,             -- emergency, 24-hour, beer-garden
  label           text not null,
  attribute_key   text not null,             -- matches listing_attributes.key
  attribute_value text not null,
  min_listings    smallint not null default 5,
  unique (category_id, slug)
);

-- ---------------------------------------------------------------- listings

create type listing_status as enum ('draft','scraped','claimed','verified','suspended','closed');

create table listings (
  id              uuid primary key default uuid_generate_v4(),
  slug            text not null unique,      -- riverside-plumbing-co
  name            text not null,
  legal_name      text,
  abn             text,
  status          listing_status not null default 'scraped',
  vertical        vertical not null,
  description     text,
  phone           text,
  email           text,
  website         text,
  booking_url     text,

  -- physical location
  address_line    text,
  locality_id     uuid references localities(id),
  postcode        text,
  location        geography(point,4326),
  is_mobile       boolean not null default false,  -- no shopfront, service area only

  logo_url        text,
  logo_bg         text,                       -- fallback tile colour
  cover_url       text,

  claimed_by      uuid,                       -- auth.users
  claimed_at      timestamptz,
  verified_at     timestamptz,
  abn_verified_at timestamptz,

  quality_score   smallint not null default 0,   -- 0..100, computed nightly
  is_indexable    boolean not null default false,
  link_rel        text not null default 'nofollow',  -- set by quality_score job

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on listings using gist (location);
create index on listings using gin (name gin_trgm_ops);
create index on listings (locality_id, status);

create table listing_categories (
  listing_id      uuid not null references listings(id) on delete cascade,
  category_id     uuid not null references categories(id),
  is_primary      boolean not null default false,
  primary key (listing_id, category_id)
);

-- THE cross border table. A listing appears on a locality page if it either
-- sits there or services there.
create table listing_service_areas (
  listing_id      uuid not null references listings(id) on delete cascade,
  locality_id     uuid not null references localities(id),
  travel_fee      numeric(8,2),
  primary key (listing_id, locality_id)
);

create index on listing_service_areas (locality_id);

-- vertical specific fields without 200 nullable columns
create table listing_attributes (
  listing_id      uuid not null references listings(id) on delete cascade,
  key             text not null,             -- beer_garden, pet_friendly, callout_fee
  value           text not null,
  primary key (listing_id, key)
);

create index on listing_attributes (key, value);

-- ---------------------------------------------------------------- licences

create type licence_state as enum ('NSW','VIC','NATIONAL');

create table licences (
  id                uuid primary key default uuid_generate_v4(),
  listing_id        uuid not null references listings(id) on delete cascade,
  state             licence_state not null,
  number            text not null,
  class             text,                    -- plumbing, electrical, building
  holder_name       text,
  expires_on        date,
  register_url      text,
  last_verified_at  timestamptz,
  verification_ok   boolean,
  unique (listing_id, state, number)
);

-- ---------------------------------------------------------------- hours

create table opening_hours (
  listing_id      uuid not null references listings(id) on delete cascade,
  day_of_week     smallint not null,         -- 0 = Sunday
  opens           time,
  closes          time,
  is_closed       boolean not null default false,
  note            text,                      -- "emergency callouts only"
  primary key (listing_id, day_of_week)
);

-- public holidays differ between NSW and VIC, so this is state aware
create table public_holidays (
  state_code      text not null references states(code),
  date            date not null,
  name            text not null,
  primary key (state_code, date)
);

create table special_hours (
  listing_id      uuid not null references listings(id) on delete cascade,
  date            date not null,
  opens           time,
  closes          time,
  is_closed       boolean not null default false,
  primary key (listing_id, date)
);

-- ---------------------------------------------------------------- reviews

create table reviews (
  id              uuid primary key default uuid_generate_v4(),
  listing_id      uuid not null references listings(id) on delete cascade,
  author_id       uuid,
  author_name     text not null,
  rating          smallint not null check (rating between 1 and 5),
  body            text not null,
  job_type        text,
  is_verified     boolean not null default false,  -- came through a site enquiry
  published_at    timestamptz,
  owner_reply     text,
  owner_replied_at timestamptz,
  created_at      timestamptz not null default now()
);

create index on reviews (listing_id, published_at desc);

-- ---------------------------------------------------------------- link partners

create table partner_links (
  id              uuid primary key default uuid_generate_v4(),
  listing_id      uuid not null references listings(id) on delete cascade,
  domain          text not null,
  found_url       text,
  anchor_text     text,
  rel_attributes  text,                      -- what THEY used
  http_status     smallint,
  is_live         boolean not null default false,
  first_seen_at   timestamptz,
  last_checked_at timestamptz,
  last_seen_at    timestamptz,
  miss_count      smallint not null default 0,
  unique (listing_id, domain)
);

-- ---------------------------------------------------------------- editorial

create table guides (
  id              uuid primary key default uuid_generate_v4(),
  slug            text not null unique,
  title           text not null,
  body            text not null,
  author          text not null,
  locality_id     uuid references localities(id),
  category_id     uuid references categories(id),
  published_at    timestamptz,
  reviewed_at     timestamptz
);

create table curated_lists (
  id              uuid primary key default uuid_generate_v4(),
  slug            text not null unique,      -- best-pubs-albury
  title           text not null,
  intro           text not null,
  locality_id     uuid not null references localities(id),
  category_id     uuid references categories(id),
  published_at    timestamptz,
  reviewed_at     timestamptz
);

create table curated_list_items (
  list_id         uuid not null references curated_lists(id) on delete cascade,
  listing_id      uuid not null references listings(id),
  position        smallint not null,
  blurb           text not null,             -- human written, not the listing desc
  primary key (list_id, listing_id)
);

-- ---------------------------------------------------------------- enquiries

create table enquiries (
  id              uuid primary key default uuid_generate_v4(),
  listing_id      uuid not null references listings(id),
  locality_id     uuid references localities(id),
  category_id     uuid references categories(id),
  name            text not null,
  phone           text,
  email           text,
  message         text not null,
  responded_at    timestamptz,               -- feeds median response time stat
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- redirects

create table redirects (
  from_path       text primary key,
  to_path         text not null,
  status_code     smallint not null default 301,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- page stats
-- materialised nightly, powers the unique data block on every category page

create materialized view locality_category_stats as
select
  sa.locality_id,
  lc.category_id,
  count(distinct l.id)                                        as listing_count,
  count(distinct l.id) filter (where l.status = 'verified')   as verified_count,
  count(distinct l.id) filter (where lic.verification_ok)     as licenced_count,
  count(distinct l.id) filter (
    where exists (select 1 from opening_hours oh
                  where oh.listing_id = l.id and oh.day_of_week = 6 and not oh.is_closed)
  )                                                           as open_saturday_count,
  count(distinct l.id) filter (where l.locality_id <> sa.locality_id) as services_from_elsewhere,
  round(avg(nullif(la.value,'')::numeric), 0)                 as avg_callout_fee,
  round(avg(r.rating), 2)                                     as avg_rating
from listing_service_areas sa
join listings l              on l.id = sa.listing_id and l.status <> 'suspended'
join listing_categories lc   on lc.listing_id = l.id
left join licences lic       on lic.listing_id = l.id
left join listing_attributes la on la.listing_id = l.id and la.key = 'callout_fee'
left join reviews r          on r.listing_id = l.id and r.published_at is not null
group by sa.locality_id, lc.category_id;

create unique index on locality_category_stats (locality_id, category_id);

-- indexation gate: a category page goes live once it has real content
-- run nightly after the refresh
--
--   refresh materialized view concurrently locality_category_stats;
--
--   update listings set is_indexable = (quality_score >= 40);
--   update listings set link_rel = case
--     when status = 'verified' and quality_score >= 70 then 'follow'
--     when status = 'claimed'  and quality_score >= 80 then 'follow'
--     else 'nofollow' end;
