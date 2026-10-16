-- Commission engine v2: 3-level retail override with a hold window, purchase
-- attribution (code/store purchases pay the buyer's referrer) and idempotency.
--
-- * ref_id/ref_type make every payout traceable to what caused it (an order or
--   a purchase), so a refund can reverse exactly what was credited.
-- * release_at holds new credits pending until the CPA cooling-off window has
--   passed; release moves pending_zar -> balance_zar.
-- * the partial unique index stops the same event paying the same user twice.
begin;

alter table public.commissions add column if not exists ref_id uuid;
alter table public.commissions add column if not exists ref_type text;
alter table public.commissions add column if not exists release_at timestamptz;
alter table public.commissions add column if not exists released_at timestamptz;
alter table public.commissions add column if not exists reversed_at timestamptz;
alter table public.commissions add column if not exists description text;

-- Commission holds get their own bucket: `pending_zar` already means "withdrawal
-- in flight" (wallets.withdraw moves balance -> pending), so reusing it would
-- let a release steal money earmarked for a payout.
alter table public.wallets add column if not exists held_zar numeric not null default 0;
comment on column public.wallets.held_zar is
  'Commission credits still inside their hold window (see commissions.release_at).';

comment on column public.commissions.ref_type is
  'order | code_purchase | store_purchase | manual';
comment on column public.commissions.release_at is
  'When a pending commission becomes available in the wallet.';

create unique index if not exists commissions_ref_uk
  on public.commissions (ref_type, ref_id, user_id, (coalesce(level, 0)))
  where ref_id is not null;

create index if not exists commissions_due_idx
  on public.commissions (release_at)
  where status = 'pending';

create index if not exists commissions_user_status_idx
  on public.commissions (user_id, status, created_at);

-- Back-fill a release_at for anything already sitting in 'pending' so the
-- release job picks up pre-existing rows instead of stranding them.
update public.commissions
  set release_at = coalesce(release_at, created_at + interval '7 days')
  where status = 'pending' and release_at is null;

commit;
