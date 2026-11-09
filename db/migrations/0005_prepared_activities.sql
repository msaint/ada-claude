-- Next activities generated ahead of time (while the learner reads feedback or
-- answers a step whose outcome can't change what comes next). They are only
-- used when the planner's real decision matches `signature`; otherwise the
-- next activity is generated live as before.
create table prepared_activities (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  after_activity_id uuid not null references activities(id) on delete cascade,
  signature text not null,
  mode text not null check (mode in ('presented','graded')),
  status text not null check (status in ('generating','ready','failed')),
  spec_json jsonb,
  model_info_json jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, after_activity_id, signature)
);
create index prepared_activities_lookup on prepared_activities (session_id, after_activity_id);
create trigger prepared_activities_updated before update on prepared_activities for each row execute function set_updated_at();
alter table prepared_activities enable row level security;
