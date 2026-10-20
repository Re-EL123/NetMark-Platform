create table if not exists user_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_uemail_token on user_email_verifications(token, email);
create index if not exists idx_uemail_user on user_email_verifications(user_id);
alter table user_email_verifications enable row level security;
