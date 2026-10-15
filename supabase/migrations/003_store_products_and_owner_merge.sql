-- NetMark Platform - migration 003: merge distributor into owner and introduce
-- the store-product listing model (company catalog + store markup).
-- Idempotent: safe to run repeatedly against an existing database.

-- ---------------------------------------------------------------------------
-- 1. Merge the distributor role into owner
-- ---------------------------------------------------------------------------
-- Everyone who was a distributor becomes an owner (company). Their codes and
-- attributions remain in place; only the role label changes.
update public.users set role = 'owner' where role = 'distributor';

-- Tighten the role check constraint to the new set of roles.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('platformAdmin','owner','storeOwner','customer','driver'));

-- ---------------------------------------------------------------------------
-- 2. Store product listings
-- ---------------------------------------------------------------------------
-- A company owns the catalog (products). A store owner "lists" a catalog
-- product in their store and sets their own retail price; the difference
-- between the retail price and the company price is their margin.
alter table public.store_products add column if not exists price numeric;
alter table public.store_products add column if not exists is_active boolean not null default true;

-- One listing per store + product.
create unique index if not exists store_products_store_product_key
  on public.store_products (store_id, product_id);

create index if not exists store_products_product_id_idx on public.store_products(product_id);
create index if not exists store_products_company_id_idx on public.store_products(company_id);

-- Backfill listings from legacy products that were created directly against a
-- store, so existing storefronts keep working after the switch.
insert into public.store_products (store_id, product_id, company_id, price, is_active)
select p.store_id, p.id, p.company_id, p.price, coalesce(p.is_active, true)
from public.products p
where p.store_id is not null
on conflict do nothing;
