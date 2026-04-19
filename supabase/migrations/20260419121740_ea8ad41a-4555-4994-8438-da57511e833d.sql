create type public.app_role as enum ('admin', 'engineer');
create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_status as enum ('pending', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'pending',
  points_awarded int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.tasks enable row level security;
create index tasks_user_id_idx on public.tasks(user_id);
create index tasks_completed_at_idx on public.tasks(completed_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  insert into public.user_roles (user_id, role) values (new.id, 'engineer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_task_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and (TG_OP = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
    new.points_awarded := case new.priority
      when 'high' then 20
      when 'medium' then 15
      else 10
    end;
  elsif new.status = 'pending' then
    new.completed_at := null;
    new.points_awarded := 0;
  end if;
  return new;
end;
$$;

create trigger tasks_handle_completion_ins
  before insert on public.tasks
  for each row execute function public.handle_task_completion();
create trigger tasks_handle_completion_upd
  before update on public.tasks
  for each row execute function public.handle_task_completion();

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can view their own roles"
  on public.user_roles for select using (auth.uid() = user_id);
create policy "Admins can view all roles"
  on public.user_roles for select using (public.has_role(auth.uid(), 'admin'));
create policy "Admins can manage roles"
  on public.user_roles for all using (public.has_role(auth.uid(), 'admin'));

create policy "Users can view their own tasks"
  on public.tasks for select using (auth.uid() = user_id);
create policy "Admins can view all tasks"
  on public.tasks for select using (public.has_role(auth.uid(), 'admin'));
create policy "Users can insert their own tasks"
  on public.tasks for insert with check (auth.uid() = user_id);
create policy "Users can update their own tasks"
  on public.tasks for update using (auth.uid() = user_id);
create policy "Users can delete their own tasks"
  on public.tasks for delete using (auth.uid() = user_id);

create or replace view public.leaderboard_all
with (security_invoker = true) as
select
  p.id as user_id,
  p.display_name,
  p.avatar_url,
  coalesce(sum(t.points_awarded), 0)::int as total_points,
  count(t.id) filter (where t.status = 'completed')::int as tasks_completed,
  max(case when t.priority = 'high' and t.status = 'completed' then 1 else 0 end)::int as has_high,
  min(t.completed_at) filter (where t.status = 'completed') as first_completion
from public.profiles p
left join public.tasks t on t.user_id = p.id
group by p.id, p.display_name, p.avatar_url;

grant select on public.leaderboard_all to authenticated;