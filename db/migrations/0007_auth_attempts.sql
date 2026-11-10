-- Sign-in attempts, used only to slow down password guessing. Emails and IPs
-- are stored as truncated hashes. Rows are deleted by the daily cleanup job.
create table auth_attempts (
  id bigserial primary key,
  email_hash text not null,
  ip_hash text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_email_idx on auth_attempts (email_hash, created_at);
create index auth_attempts_ip_idx on auth_attempts (ip_hash, created_at);
alter table auth_attempts enable row level security;
