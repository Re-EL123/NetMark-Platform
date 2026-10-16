-- 012: analytics helpers, platform infra (API keys, webhooks, feature flags)

-- ---------------------------------------------------------------------------
-- Tenant scoped API keys (server-to-server)
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scopes text[] not null default array['read'],
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.api_keys enable row level security;
create index if not exists api_keys_tenant_idx on public.api_keys(tenant_id);
create index if not exists api_keys_prefix_idx on public.api_keys(prefix);

-- ---------------------------------------------------------------------------
-- Webhooks out (tenant/company scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  url text not null,
  secret text,
  events text[] not null default array['*'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.webhooks enable row level security;
create index if not exists webhooks_tenant_idx on public.webhooks(tenant_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid references public.webhooks(id) on delete cascade,
  event text not null,
  status_code int,
  success boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
alter table public.webhook_deliveries enable row level security;
create index if not exists webhook_deliveries_hook_idx on public.webhook_deliveries(webhook_id);

-- ---------------------------------------------------------------------------
-- Feature flags (global or per tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  enabled boolean not null default false,
  rollout_percent int not null default 100 check (rollout_percent between 0 and 100),
  tenant_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, tenant_id)
);
create unique index if not exists feature_flags_global_key on public.feature_flags(key) where tenant_id is null;
alter table public.feature_flags enable row level security;

insert into public.feature_flags (key, enabled, description)
select v.key, false, v.description
from (values
  ('autoship', 'Scheduled repeat orders'),
  ('white-label', 'White-label branding for companies'),
  ('store-purchases', 'Purchase-required stores'),
  ('commissions-v2', 'Commission engine v2 bonuses')
) as v(key, description)
on conflict (key) where tenant_id is null do nothing;
