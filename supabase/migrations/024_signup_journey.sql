-- Enrich users with profile data + marketing opt-in for the signup journey
alter table public.users add column if not exists profile_data jsonb;
alter table public.users add column if not exists marketing_opt_in boolean not null default false;
-- Payout details added in 023; ensure present
alter table public.users add column if not exists payout_details jsonb;
-- Companies can store richer signup/business metadata
alter table public.companies add column if not exists contact jsonb;
alter table public.companies add column if not exists address jsonb;
alter table public.companies add column if not exists documents jsonb not null default '[]'::jsonb;
-- Drivers bank_details already exists in schema; ensure
alter table public.drivers add column if not exists bank_details jsonb;
alter table public.drivers add column if not exists documents jsonb not null default '[]'::jsonb;
