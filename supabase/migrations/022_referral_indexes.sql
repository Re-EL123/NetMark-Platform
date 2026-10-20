-- Referral attribution indexes and constraints.
-- These columns are queried on every signup, order, commission-chain walk and
-- analytics scan, but had no indexes (and no referential integrity) before.

create index if not exists idx_users_distributor_id on users(distributor_id);
create index if not exists idx_orders_distributor_id on orders(distributor_id);
create index if not exists idx_distributor_codes_distributor_id on distributor_codes(distributor_id);

-- Distributor code usage counter helper (idempotent guard against double count
-- is handled in application code; this index speeds validation lookups).
create index if not exists idx_distributor_codes_code on distributor_codes(code);

-- Membership sponsor lookups (downline traversal).
create index if not exists idx_memberships_user_company on company_memberships(user_id, company_id);
