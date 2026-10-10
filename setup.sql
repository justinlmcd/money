-- MONEY. Run once in your Supabase project (SQL Editor). Safe to share a project with other apps.
-- Two tables: what you spent, and what charges you on a schedule.
begin;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  occurred_on date not null,
  amount numeric not null check (amount >= 0),
  merchant text not null default '',
  category text not null default 'Other',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  amount numeric not null check (amount >= 0),
  cadence text not null default 'monthly' check (cadence in ('weekly','monthly','yearly')),
  category text not null default 'Subscriptions',
  next_charge date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index transactions_by_day on public.transactions (user_id, occurred_on desc);
create index subscriptions_by_user on public.subscriptions (user_id, active);

alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;

-- You see and change only your own rows. Spending can be corrected, so updates and deletes are allowed.
create policy tx_read   on public.transactions for select using (user_id = auth.uid());
create policy tx_write  on public.transactions for insert with check (user_id = auth.uid());
create policy tx_edit   on public.transactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tx_remove on public.transactions for delete using (user_id = auth.uid());

create policy sub_read   on public.subscriptions for select using (user_id = auth.uid());
create policy sub_write  on public.subscriptions for insert with check (user_id = auth.uid());
create policy sub_edit   on public.subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sub_remove on public.subscriptions for delete using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;

commit;
