-- OptiDoerAPP — Supabase 初始数据库结构。
-- 在 Supabase 控制台 → SQL Editor 里粘贴整个文件并运行一次即可。

-- ── profiles：账号/试用/订阅信息，1:1 对应 auth.users ──
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  trial_started_at timestamptz not null default now(),
  subscribed boolean not null default false,
  plan text check (plan in ('tier1', 'tier2')),
  billing text check (billing in ('monthly', 'yearly')),
  subscribed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "用户可读自己的 profile" on public.profiles
  for select using (auth.uid() = id);
create policy "用户可建自己的 profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "用户可改自己的 profile" on public.profiles
  for update using (auth.uid() = id);

-- 新用户注册时自动建一行 profile（trial 从此刻开始）。
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── events：日历事件 ──
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  location text not null default '',
  description text not null default '',
  start timestamptz not null,
  "end" timestamptz not null,
  all_day boolean not null default false,
  completed boolean not null default false,
  color text,
  recurrence text not null default 'none',
  custom_interval_days int,
  recurrence_occurrences int,
  reminders int[] not null default '{}',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "用户可管理自己的事件" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists events_user_id_idx on public.events(user_id);

-- ── notes：笔记 ──
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content_html text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  archived boolean not null default false,
  reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "用户可管理自己的笔记" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists notes_user_id_idx on public.notes(user_id);

-- ── 基本表级权限 ──
-- 用 SQL Editor 直接建表时，Supabase 不会像网页版 Table Editor 那样自动加这层 grant，
-- 漏了这步会导致所有请求收到 403（不是 RLS 拒绝，是角色本身没有访问这张表的权限）。
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.notes to authenticated;

-- service_role 同理也要补（管理后台 /admin 用这个角色绕过 RLS）。
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.events to service_role;
grant select, insert, update, delete on public.notes to service_role;

-- 注：以上策略只允许「本人」读写自己的数据——这是前端用 anon key 直连数据库的安全基础。
-- 管理员后台（改任意用户 trial/订阅、查看任意用户 note）不能靠 RLS 放权，
-- 必须在服务端 API 路由里用 service_role key（绕过 RLS）单独实现，绝不下发到浏览器。
