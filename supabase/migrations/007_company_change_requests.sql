-- NetMark Platform - migration 007: company change requests.
--
-- Company owners can propose changes to their company's details (name, logo,
-- contact/address and delivery settings) but those changes only take effect
-- once a platform admin approves them. Each company keeps at most one open
-- (pending) request; submitting again replaces the pending proposal.
--
-- Idempotent: safe to run repeatedly against an existing database.

create table if not exists public.company_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid,
  requested_by_email text,
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_change_requests_company_id_idx
  on public.company_change_requests (company_id);
create index if not exists company_change_requests_status_idx
  on public.company_change_requests (status);
create index if not exists company_change_requests_created_at_idx
  on public.company_change_requests (created_at desc);

-- Only one pending request per company.
create unique index if not exists company_change_requests_one_pending
  on public.company_change_requests (company_id)
  where status = 'pending';

drop trigger if exists set_updated_at on public.company_change_requests;
create trigger set_updated_at before update on public.company_change_requests
  for each row execute function public.set_updated_at();

alter table public.company_change_requests enable row level security;
