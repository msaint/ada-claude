-- Guest (anonymous) users: try Ada without an account. A guest is a normal
-- user row with no email/password; signing up upgrades the same row in place,
-- so all of the guest's courses and evidence carry over.
alter table users alter column email drop not null;
alter table users alter column password_hash drop not null;
alter table users add column is_guest boolean not null default false;
-- Truncated hash of the creating IP, used only to rate-limit guest creation.
alter table users add column guest_ip_hash text;
alter table users add constraint users_guest_or_credentials
  check (is_guest or (email is not null and password_hash is not null));
create index users_guest_idx on users (is_guest, created_at) where is_guest;
create index users_guest_ip_idx on users (guest_ip_hash, created_at) where is_guest;
create index auth_sessions_expiry_idx on auth_sessions (expires_at);
alter table users enable row level security;
