-- Autoship runner bookkeeping: surface the last run error (if any).
begin;

alter table public.autoship_subscriptions
  add column if not exists last_error text;

commit;
