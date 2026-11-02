-- MONEY budget. Run once in your Supabase SQL editor (same project as setup.sql). Safe to run again.
begin;

-- Your monthly numbers, and the last budget made from them. One row per person.
create table if not exists public.money_profile (
  user_id uuid primary key default auth.uid(),
  monthly_income numeric check (monthly_income >= 0),
  total_debt numeric check (total_debt >= 0),
  debt_apr numeric check (debt_apr between 0 and 100),
  debt_min_payment numeric check (debt_min_payment >= 0),
  savings numeric check (savings >= 0),
  budget jsonb,
  budget_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.money_profile enable row level security;

drop policy if exists mp_read on public.money_profile;
drop policy if exists mp_write on public.money_profile;
drop policy if exists mp_edit on public.money_profile;
drop policy if exists mp_remove on public.money_profile;
create policy mp_read   on public.money_profile for select using (user_id = auth.uid());
create policy mp_write  on public.money_profile for insert with check (user_id = auth.uid());
create policy mp_edit   on public.money_profile for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mp_remove on public.money_profile for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.money_profile to authenticated;
commit;
