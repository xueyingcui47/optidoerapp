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
  -- 年费用户预约"切到月付"——不立即生效，等当前已付的这一年到期那天才真正切换。
  pending_billing text check (pending_billing in ('monthly')),
  pending_billing_effective_at timestamptz,
  -- 邀请功能：referral_code 是这个用户自己的邀请码（注册时自动生成）；referred_by 记录
  -- 这个用户注册时用了谁的邀请码（一次性，用过就不能再用别的码）；trial_days 默认 15，
  -- 被邀请注册成功后改成 45；membership_credit_until 是邀请人攒到的"会员有效期延长"——
  -- 现在订阅是模拟的没有真实账期，先记下这个日期，以后接真实 Stripe 账期时用来抵扣/跳过下一次扣款。
  referral_code text unique,
  referred_by text,
  trial_days int not null default 15,
  membership_credit_until timestamptz,
  -- 真实 Stripe 订阅的账号/订单 ID（webhook 用来找回是哪个用户、之后管理订阅用）。
  stripe_customer_id text,
  stripe_subscription_id text,
  -- 用户偏好设置（通知渠道、提醒提前量、AI 开关等）。放进数据库才能跨设备同步，
  -- 而且服务端的每日 digest 才读得到"是否关了邮件提醒"。
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "用户可读自己的 profile" on public.profiles
  for select using (auth.uid() = id);
create policy "用户可建自己的 profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "用户可改自己的 profile" on public.profiles
  for update using (auth.uid() = id);

-- 新用户注册时自动建一行 profile（trial 从此刻开始），同时生成一个 8 位邀请码。
-- 如果注册时带了别人的邀请码（前端把它塞进 auth signUp 的 user_metadata.referral_code）：
--   · 自己的试用天数改成 45（trial_days）。
--   · 只有邀请人在这一刻本人是「已订阅」状态，才给邀请人加 1 个月的会员有效期延长
--     （membership_credit_until 往后推 1 个月，叠加在原有的延长之上）——这是题目要求的
--     "优惠只限于付费用户"。试用期用户分享邀请码邀到人也不会有任何奖励。
-- 这段逻辑放在数据库触发器里（而不是前端再调一次 API）是因为：如果项目开了邮箱验证，
-- signUp() 当下根本拿不到登录 session，没法再补发一个"兑换邀请码"的请求；放触发器里
-- 保证不管要不要邮箱验证，注册这一下子就把邀请关系处理完，不依赖后续任何步骤。
create or replace function public.handle_new_user()
returns trigger as $$
declare
  ref_code text;
  referrer public.profiles;
begin
  insert into public.profiles (id, name, email, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    upper(substr(replace(new.id::text, '-', ''), 1, 8))
  );

  ref_code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  if ref_code <> '' then
    select * into referrer from public.profiles where referral_code = ref_code and id <> new.id;
    if found then
      update public.profiles set referred_by = ref_code, trial_days = 45 where id = new.id;
      if referrer.subscribed then
        update public.profiles
        set membership_credit_until =
          (case
            when referrer.membership_credit_until is not null and referrer.membership_credit_until > now()
            then referrer.membership_credit_until
            else now()
          end) + interval '1 month'
        where id = referrer.id;
      end if;
    end if;
  end if;

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
