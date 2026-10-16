begin;
create table if not exists public.autoship_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid references public.users(id),
  order_id uuid references public.orders(id),
  interval_days integer not null default 30,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','paused','cancelled','failed')),
  failed_count integer not null default 0,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists autoship_user_idx on public.autoship_subscriptions(user_id);
create index if not exists autoship_tenant_idx on public.autoship_subscriptions(tenant_id);
create index if not exists autoship_next_idx on public.autoship_subscriptions(next_run_at);
commit;
