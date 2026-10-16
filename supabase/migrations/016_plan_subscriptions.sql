-- PayFast plan subscriptions.
--
-- Reuses the generic `payments` ledger for plan payments (order_id is null for
-- these), tagging them with a `kind` and `related_id` (the plan being bought).
-- `companies_plans.billing_status` / `next_billing_at` drive whether the paid
-- entitlements are currently in force (see apps/api/lib/planLimits.ts).
begin;

alter table public.payments add column if not exists kind text not null default 'order';
alter table public.payments add column if not exists related_id uuid;

create index if not exists payments_company_kind_idx on public.payments (company_id, kind);

alter table public.companies_plans add column if not exists custom_overrides jsonb not null default '{}'::jsonb;

commit;
