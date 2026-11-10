-- Short-lived claims that serialise model-backed work on one resource
-- (a session, a draft, an activity's hints) WITHOUT holding a database
-- connection or row lock while the model is running. A claim expires on its
-- own, so a crashed function never blocks a learner for long. Correctness
-- does not depend on claims: every result is applied in a short transaction
-- that re-checks the row's state. Claims only prevent duplicate model calls.
create table work_claims (
  resource text primary key,
  token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table work_claims enable row level security;
