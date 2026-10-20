create table if not exists navigation_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'platform',
  company_id uuid references companies(id) on delete cascade,
  role text,
  nav_key text not null,
  visible boolean default true,
  order_index integer default 0,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(scope, company_id, role, nav_key)
);

alter table navigation_settings enable row level security;
