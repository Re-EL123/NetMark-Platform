-- Company billing plans.
--
-- The pricing model is now a flat monthly fee per plan (`base_fee_zar`);
-- `per_active_distributor_zar` is retired (kept at 0 for compatibility). The
-- `features` jsonb carries the entitlement set enforced by
-- apps/api/lib/planLimits.ts. Numeric limits use -1 for "unlimited".
--
-- Lineup: Free / Starter / Pro. The Free tier doubles as the default for any
-- company without an explicit assignment.
begin;

alter table public.plans add column if not exists features jsonb not null default '{}'::jsonb;

-- Retire the legacy tiers and clear the old default before installing the new
-- lineup. (They are re-activated below only if still part of the lineup.)
update public.plans set is_default = false where is_default = true;
update public.plans set is_active = false where slug in ('growth', 'scale');

insert into public.plans (name, slug, tier, base_fee_zar, per_active_distributor_zar, features, is_active, is_default, sort_order)
values
  ('Free', 'free', 'free', 0, 0, '{
    "maxProducts": 10, "maxStores": 1, "maxTeamMembers": 1, "maxCodes": 3,
    "commissionLevels": 1, "payouts": false, "reports": "basic",
    "autoship": false, "whiteLabel": false, "api": false, "webhooks": false
  }'::jsonb, true, true, 1),
  ('Starter', 'starter', 'starter', 299, 0, '{
    "maxProducts": 100, "maxStores": 5, "maxTeamMembers": 10, "maxCodes": -1,
    "commissionLevels": 3, "payouts": true, "reports": "full",
    "autoship": true, "whiteLabel": false, "api": false, "webhooks": false
  }'::jsonb, true, false, 2),
  ('Pro', 'pro', 'pro', 999, 0, '{
    "maxProducts": -1, "maxStores": -1, "maxTeamMembers": -1, "maxCodes": -1,
    "commissionLevels": 3, "payouts": true, "reports": "full",
    "autoship": true, "whiteLabel": true, "api": true, "webhooks": true
  }'::jsonb, true, false, 3)
on conflict (slug) do update set
  name = excluded.name,
  tier = excluded.tier,
  base_fee_zar = excluded.base_fee_zar,
  per_active_distributor_zar = excluded.per_active_distributor_zar,
  features = excluded.features,
  is_active = true,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order;

commit;
