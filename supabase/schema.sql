-- supabase/schema.sql
--
-- Postgres schema for the satire-vs-real study (Assignment 3). Run it once in the Supabase
-- dashboard (SQL Editor -> New query -> paste -> Run) BEFORE `npm run seed`.
--
-- Security model: Row Level Security is ENABLED on every table and NO policies are defined, so the
-- public `anon` key can read or write nothing. Only the server (Next.js API routes) touches the data,
-- with the service-role key, which bypasses RLS. Never expose that key to the browser.

-- The 240 Assignment 2 study headlines plus the attention-check item, with the answer key.
create table if not exists public.items (
  id       text primary key,
  headline text not null,
  label    text not null check (label in ('Satire','Real')),
  type     text not null,
  topic    text not null,
  source   text not null
);

-- One row per person per condition. `code` is the self-chosen code that pairs a person's two
-- sessions; nothing else identifies them.
create table if not exists public.sessions (
  id              text primary key,
  code            text not null,
  condition       text not null check (condition in ('baseline','assisted')),
  consented_at    timestamptz not null,
  check_failures  int not null default 0,
  check_passed_at timestamptz,
  terminated_at   timestamptz,
  completed_at    timestamptz,
  comment         text
);

-- At most one open (not terminated) session per code and condition, enforced by the database.
create unique index if not exists sessions_open_code
  on public.sessions (code, condition) where terminated_at is null;

-- One row per trial: what was shown, each answer, the AI output exactly as displayed, and times.
create table if not exists public.trials (
  session_id         text not null references public.sessions(id) on delete cascade,
  item_id            text not null references public.items(id),
  position           int  not null check (position >= 1),
  initial_answer     text check (initial_answer in ('Satire','Real')),
  initial_confidence int  check (initial_confidence between 1 and 5),
  initial_time_ms    int  check (initial_time_ms >= 0),
  initial_at         timestamptz,
  ai_json            jsonb,
  ai_shown_at        timestamptz,
  final_answer       text check (final_answer in ('Satire','Real')),
  final_confidence   int  check (final_confidence between 1 and 5),
  final_time_ms      int  check (final_time_ms >= 0),
  final_at           timestamptz,
  primary key (session_id, item_id),
  unique (session_id, position)
);

create index if not exists trials_item_idx on public.trials (item_id);
create index if not exists sessions_code_idx on public.sessions (code);

alter table public.items    enable row level security;
alter table public.sessions enable row level security;
alter table public.trials   enable row level security;
