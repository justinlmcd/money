-- MONEY debts. Run once in your Supabase SQL editor (same project as setup.sql and budget.sql). Safe to run again.
begin;

-- Each debt you're paying off: what's left, its interest rate and the minimum you must pay.
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  balance numeric not null default 0 check (balance >= 0),
  apr numeric check (apr between 0 and 100),
  min_payment numeric check (min_payment >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debts_by_user on public.debts (user_id, balance);
alter table public.debts enable row level security;

drop policy if exists d_read on public.debts;
drop policy if exists d_write on public.debts;
drop policy if exists d_edit on public.debts;
drop policy if exists d_remove on public.debts;
create policy d_read   on public.debts for select using (user_id = auth.uid());
create policy d_write  on public.debts for insert with check (user_id = auth.uid());
create policy d_edit   on public.debts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy d_remove on public.debts for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.debts to authenticated;

-- What you choose to pay toward debt each month, and which debt gets the extra first.
alter table if exists public.money_profile add column if not exists debt_monthly numeric check (debt_monthly >= 0);
alter table if exists public.money_profile add column if not exists debt_strategy text not null default 'avalanche' check (debt_strategy in ('avalanche','snowball'));

commit;
