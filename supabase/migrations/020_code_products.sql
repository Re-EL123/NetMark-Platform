create table if not exists code_products (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references distributor_codes(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(code_id, product_id)
);

alter table distributor_codes add column if not exists allow_all_products boolean default true;
alter table distributor_codes add column if not exists product_filter_mode text default 'all';

create index if not exists idx_code_products_code on code_products(code_id);
create index if not exists idx_code_products_product on code_products(product_id);

alter table code_products enable row level security;
