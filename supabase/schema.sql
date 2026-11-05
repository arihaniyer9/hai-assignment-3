-- supabase/schema.sql
--
-- Postgres schema for the emotion-labeling task. Run this once in the Supabase
-- dashboard (SQL Editor -> New query -> paste -> Run) BEFORE `npm run seed`.
--
-- Security model: Row Level Security is ENABLED on every table and NO policies
-- are defined. That means the public `anon` key can read/write nothing. Only the
-- server (Next.js API routes) accesses the data, using the service-role key,
-- which bypasses RLS. Never expose the service-role key to the browser.

create table if not exists public.tweets (
  id           text primary key,
  text         text not null,
  ground_truth text not null
    check (ground_truth in ('anger','fear','joy','love','sadness','surprise'))
);

create table if not exists public.participants (
  id           text primary key,
  nickname     text,
  consented_at timestamptz not null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- The 5 tweets randomly drawn for each participant, and the order they see them.
create table if not exists public.assignments (
  participant_id text not null references public.participants(id) on delete cascade,
  tweet_id       text not null references public.tweets(id),
  position       int  not null check (position between 1 and 5),
  primary key (participant_id, tweet_id),
  unique (participant_id, position)
);

-- WHO labeled WHICH tweet with WHICH label (the core research data).
create table if not exists public.labels (
  participant_id text not null references public.participants(id) on delete cascade,
  tweet_id       text not null references public.tweets(id),
  label          text not null
    check (label in ('anger','fear','joy','love','sadness','surprise','unsure')),
  confidence     int  not null check (confidence between 1 and 5),
  rationale      text,
  time_spent_ms  int  not null check (time_spent_ms >= 0),
  submitted_at   timestamptz not null,
  primary key (participant_id, tweet_id)
);

create index if not exists labels_submitted_at_idx on public.labels (submitted_at);
create index if not exists assignments_tweet_idx on public.assignments (tweet_id);

alter table public.tweets       enable row level security;
alter table public.participants enable row level security;
alter table public.assignments  enable row level security;
alter table public.labels       enable row level security;
