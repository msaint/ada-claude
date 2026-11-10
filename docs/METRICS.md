# Reading Ada's usage data

Ada records operational events (never answer text) in Postgres. Until there is a dashboard, run these in the Supabase SQL editor (production project). All are read-only.

## Funnel: visits that become courses and first answers (last 14 days)

```sql
select event_type, count(*) as events, count(distinct owner_id) as people
from telemetry_events
where created_at > now() - interval '14 days'
  and event_type in ('course_draft_started', 'course_created', 'first_activity_rendered', 'attempt_submitted', 'session_completed')
group by 1 order by array_position(array['course_draft_started','course_created','first_activity_rendered','attempt_submitted','session_completed'], event_type);
```

## Guests who created an account

```sql
select count(*) filter (where is_guest) as guests_now,
       count(*) filter (where not is_guest) as accounts
from users;
```

## Do people come back? (learners active on 2+ different days)

```sql
select count(*) filter (where days >= 2) as returned, count(*) as active
from (select owner_id, count(distinct date_trunc('day', started_at)) as days
      from sessions where started_at > now() - interval '30 days' group by 1) s;
```

## Are reviews being done?

```sql
select count(*) filter (where status = 'active' and due_at <= now()) as due_now,
       count(*) filter (where last_review_at > now() - interval '7 days') as reviewed_last_7_days
from review_items;
```

## Model speed, cost drivers and failures (last 7 days)

```sql
select operation, provider, model, count(*) as calls,
       round(avg(latency_ms)) as avg_ms,
       percentile_cont(0.9) within group (order by latency_ms) as p90_ms,
       sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
       count(*) filter (where not ok) as failed
from model_usage where created_at > now() - interval '7 days'
group by 1, 2, 3 order by calls desc;
```

## How often the next question was ready in advance

```sql
select count(*) filter (where (model_info_json->>'prefetched')::boolean) as prepared, count(*) as total,
       round(avg((model_info_json->>'prefetchWaitMs')::int)) as avg_wait_ms
from activities where created_at > now() - interval '7 days';
```

## Grading outcomes (sanity check on strictness)

```sql
select activity_kind, result, independence, count(*)
from assessment_evidence where created_at > now() - interval '14 days' and result <> 'exposure'
group by 1, 2, 3 order by 1, 4 desc;
```
