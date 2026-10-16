-- NetMark Platform - migration 008: independent self-registered accounts.
--
-- Per design, only owners/platform-admins belong to a company by membership.
-- Store owners, customers, and drivers who self-registered via a referral code
-- were previously auto-joined to that company. This migration detaches
-- self-registered (code-referred) accounts so membership is only via invite
-- (owner/platform admin creation). The referral record (distributor_code,
-- distributor_id) and company_links for store owners remain intact.

begin;

-- Detach self-registered non-staff from companies.
-- Users with distributor_code != null are code-referred (self-registered).
-- Users with distributor_code null are invites (owner/platform created).
update public.users
set company_id = null
where role not in ('owner', 'platformAdmin')
  and company_id is not null
  and distributor_code is not null;

-- Self-registered drivers that were tied to a company in the users table
-- are now independent; keep drivers.company_id null (no forced join).
-- If drivers were created via invite (no distributor_code), keep their company_id.

commit;
