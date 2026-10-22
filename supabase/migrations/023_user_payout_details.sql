-- Allow owners/store owners/customers (and others) to store their own payout
-- banking details for self-serve withdrawals. Drivers already use
-- drivers.bank_details; this adds a generic place on users.
alter table public.users add column if not exists payout_details jsonb;
