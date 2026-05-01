
create table public.user_google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_google_tokens enable row level security;

create policy "Users view own google tokens"
  on public.user_google_tokens for select
  using (auth.uid() = user_id);

create policy "Users insert own google tokens"
  on public.user_google_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users update own google tokens"
  on public.user_google_tokens for update
  using (auth.uid() = user_id);

create policy "Users delete own google tokens"
  on public.user_google_tokens for delete
  using (auth.uid() = user_id);

create table public.calendar_reminders_seen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  event_start timestamptz not null,
  notified_at timestamptz not null default now(),
  unique (user_id, event_id, event_start)
);

alter table public.calendar_reminders_seen enable row level security;

create policy "Users view own reminders seen"
  on public.calendar_reminders_seen for select
  using (auth.uid() = user_id);

create policy "Users insert own reminders seen"
  on public.calendar_reminders_seen for insert
  with check (auth.uid() = user_id);

create index idx_reminders_seen_user on public.calendar_reminders_seen(user_id, event_start);
