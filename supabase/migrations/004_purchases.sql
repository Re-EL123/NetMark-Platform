-- Store owners buy stock from the company they joined (wholesale) and resell
-- in their store at their own retail price.

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  company_id uuid,
  store_id uuid,
  store_owner_id uuid,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  payment_method text,
  payment_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table purchases
  add constraint purchases_status_check
  check (status in ('pending', 'confirmed', 'ready', 'completed', 'cancelled'));

alter table purchases
  add constraint purchases_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'refunded'));

create index if not exists purchases_company_id_idx on purchases (company_id);
create index if not exists purchases_store_owner_id_idx on purchases (store_owner_id);
create index if not exists purchases_store_id_idx on purchases (store_id);

-- Store owners that signed up with a company code inherit the company on the
-- stores they create, so the catalog and purchase scoping both work.
update stores
set company_id = coalesce(company_id, (select company_id from users where users.id = stores.store_owner_id))
where store_owner_id is not null and company_id is null;
