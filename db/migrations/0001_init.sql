-- Ada initial schema. All learner data is owned by exactly one user and is
-- removed by ON DELETE CASCADE when the course or the user is deleted.

create extension if not exists citext;
create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- identity
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (char_length(email) <= 254),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index auth_sessions_user_idx on auth_sessions(user_id);

create table profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create table user_preferences (
  owner_id uuid primary key references users(id) on delete cascade,
  reminders_enabled boolean not null default false,
  email_opt_in boolean not null default false,
  quiet_hours_json jsonb not null default '{"start":"21:00","end":"08:00"}',
  daily_nudge_limit int not null default 1 check (daily_nudge_limit between 0 and 5),
  weekly_nudge_limit int not null default 3 check (weekly_nudge_limit between 0 and 20),
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated before update on user_preferences for each row execute function set_updated_at();

-- ---------------------------------------------------------------- drafts
create table course_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 500),
  state_json jsonb not null default '{}',
  turns_json jsonb not null default '[]',
  status text not null default 'collecting' check (status in ('collecting','ready','converted')),
  proposal_json jsonb,
  version int not null default 1,
  idempotency_key text not null,
  converted_course_id uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);
create index course_drafts_owner_idx on course_drafts(owner_id, status);
create trigger course_drafts_updated before update on course_drafts for each row execute function set_updated_at();

-- ---------------------------------------------------------------- courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  draft_id uuid unique references course_drafts(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  topic text not null check (char_length(topic) between 1 and 500),
  intent text not null check (intent in ('curiosity','goal')),
  status text not null default 'active' check (status in ('active','paused','archived')),
  active_goal_version_id uuid,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now()
);
create index courses_owner_idx on courses(owner_id, last_opened_at desc);
create trigger courses_updated before update on courses for each row execute function set_updated_at();

alter table course_drafts add constraint course_drafts_converted_fk
  foreign key (converted_course_id) references courses(id) on delete set null;

create table course_goal_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  version int not null,
  intent text not null check (intent in ('curiosity','goal')),
  goal_text text not null check (char_length(goal_text) between 1 and 600),
  success_criteria_json jsonb not null default '[]',
  time_budget_minutes_weekly int check (time_budget_minutes_weekly between 0 and 3000),
  baseline_json jsonb not null default '{}',
  depth text,
  deadline_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  unique (course_id, version),
  unique (course_id, id)
);
-- Added after both tables exist (avoids circular create ordering).
alter table courses add constraint courses_active_goal_fk
  foreign key (id, active_goal_version_id) references course_goal_versions(course_id, id)
  deferrable initially deferred;

create table concepts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  assessment_criteria_json jsonb not null default '[]',
  importance int not null default 2 check (importance between 1 and 3),
  position int not null default 0,
  origin text not null default 'initial' check (origin in ('initial','branch','revision')),
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, id)
);
create index concepts_course_idx on concepts(course_id, position);

create table concept_edges (
  course_id uuid not null references courses(id) on delete cascade,
  from_concept_id uuid not null,
  to_concept_id uuid not null,
  edge_type text not null check (edge_type in ('prerequisite','related')),
  primary key (course_id, from_concept_id, to_concept_id, edge_type),
  -- composite FKs guarantee both ends belong to the same course
  foreign key (course_id, from_concept_id) references concepts(course_id, id) on delete cascade,
  foreign key (course_id, to_concept_id) references concepts(course_id, id) on delete cascade,
  check (from_concept_id <> to_concept_id)
);

create table course_curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  version int not null,
  plan_json jsonb not null,
  reason text not null,
  model_info_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (course_id, version)
);

-- ---------------------------------------------------------------- learning sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('lesson','review')),
  status text not null default 'active' check (status in ('active','paused','completed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  current_activity_id uuid,
  checkpoint_json jsonb not null default '{}',
  idempotency_key text,
  version int not null default 1,
  unique (owner_id, idempotency_key)
);
-- P0 policy: at most one open (active or paused) session per course.
create unique index sessions_one_open_per_course on sessions(course_id) where status in ('active','paused');
create index sessions_owner_idx on sessions(owner_id, status);

create table activities (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,
  review_item_id uuid,
  sequence_no int not null,
  kind text not null check (kind in ('explanation','multiple_choice','free_response','reflection')),
  purpose text not null,
  spec_json jsonb not null,
  status text not null default 'presented' check (status in ('presented','evaluating','answered','completed')),
  hints_json jsonb not null default '[]',
  alt_explanations_json jsonb not null default '[]',
  model_info_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (session_id, sequence_no)
);
create index activities_course_concept_idx on activities(course_id, concept_id);
alter table sessions add constraint sessions_current_activity_fk
  foreign key (current_activity_id) references activities(id) on delete set null deferrable initially deferred;

create table activity_drafts (
  activity_id uuid primary key references activities(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  draft_json jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references activities(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  submission_json jsonb not null,
  hint_count int not null default 0,
  explanation_revealed boolean not null default false,
  idempotency_key text not null,
  status text not null check (status in ('pending_evaluation','graded')),
  feedback_json jsonb,
  submitted_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table assessment_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references attempts(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,
  activity_kind text not null,
  purpose text not null,
  result text not null check (result in ('correct','partial','incorrect','uncertain','exposure')),
  score numeric(4,3) check (score between 0 and 1),
  independence text not null check (independence in ('independent','assisted')),
  difficulty int check (difficulty between 1 and 3),
  rubric_json jsonb not null default '{}',
  reason text not null default '',
  evaluator_json jsonb not null,
  created_at timestamptz not null default now()
);
create index evidence_course_concept_idx on assessment_evidence(course_id, concept_id, created_at);

-- Evidence is append-only.
create or replace function forbid_update() returns trigger language plpgsql as $$
begin
  raise exception 'assessment_evidence is append-only';
end $$;
create trigger assessment_evidence_append_only before update on assessment_evidence
  for each row execute function forbid_update();

create table mastery_estimates (
  course_id uuid not null references courses(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,
  status text not null check (status in ('not_assessed','developing','demonstrated')),
  confidence text not null check (confidence in ('none','low','provisional','consolidated')),
  last_independent_success_at timestamptz,
  last_assessed_at timestamptz,
  details_json jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (course_id, concept_id)
);

create table review_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  due_at timestamptz not null,
  interval_days int not null default 1,
  repetitions int not null default 0,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  last_review_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index review_items_one_active_per_concept on review_items(concept_id) where status = 'active';
create index review_items_due_idx on review_items(owner_id, status, due_at);
alter table activities add constraint activities_review_item_fk
  foreign key (review_item_id) references review_items(id) on delete set null;

create table course_events (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  event_type text not null,
  payload_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index course_events_course_idx on course_events(course_id, created_at);

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  course_id uuid references courses(id) on delete cascade,
  channel text not null,
  status text not null,
  idempotency_key text not null,
  payload_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (owner_id, idempotency_key)
);

create table source_references (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  title text not null,
  url text not null check (url ~ '^https?://'),
  retrieved_at timestamptz not null,
  source_type text not null
);

-- ---------------------------------------------------------------- operations
create table model_usage (
  id bigserial primary key,
  owner_id uuid references users(id) on delete cascade,
  operation text not null,
  provider text not null,
  model text not null,
  ok boolean not null,
  latency_ms int not null,
  input_tokens int,
  output_tokens int,
  error_code text,
  created_at timestamptz not null default now()
);
create index model_usage_owner_idx on model_usage(owner_id, created_at);

create table telemetry_events (
  id bigserial primary key,
  owner_id uuid references users(id) on delete cascade,
  event_type text not null,
  props_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index telemetry_events_type_idx on telemetry_events(event_type, created_at);
