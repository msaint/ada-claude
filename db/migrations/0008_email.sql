-- Email: verified addresses, one-time tokens (password reset, email
-- confirmation) and a per-user unsubscribe token for reminder emails.
alter table users add column email_verified_at timestamptz;

create table email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('reset', 'verify')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_tokens_user_idx on email_tokens (user_id, purpose, created_at);
alter table email_tokens enable row level security;

-- Unguessable token for one-click unsubscribe links (two random UUIDs, ~244 bits).
alter table user_preferences add column unsubscribe_token text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create unique index user_preferences_unsubscribe_idx on user_preferences (unsubscribe_token);
