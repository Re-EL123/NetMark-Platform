create table if not exists product_kits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists product_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid references product_kits(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  unique (kit_id, product_id)
);

create index if not exists idx_product_kits_company on product_kits(company_id);
create index if not exists idx_product_kit_items_kit on product_kit_items(kit_id);
