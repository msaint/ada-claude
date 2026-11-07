# Decisions and deviations

These are the points where the implementation departs from the build spec's defaults, or where the spec left a choice open.

### D1. Plain PostgreSQL + in-app auth instead of Supabase Auth/RLS
**Context:** The repository was empty. The build sandbox has PostgreSQL 16 but no Docker daemon, so the Supabase CLI local stack can't run here. Without it, Supabase Auth and RLS couldn't be exercised or tested.
**Decision:** Use plain PostgreSQL with SQL migrations, plus email + password auth: scrypt hashes, random 256-bit session tokens stored as SHA-256 hashes, and an HttpOnly SameSite=Lax cookie (`Secure` on https).
**How authorization is enforced:** In the service layer. Every learner query is scoped by `owner_id`, directly or through the parent, and IDs that fail the check return 404. Composite foreign keys make concept edges and goal versions belong to the same course. The cross-user integration suite tests 14 endpoints with foreign IDs.
**Trade-off:** There is no database-level RLS. If you move to Supabase later, the schema ports directly: add `auth.uid()` policies on `owner_id` and on parent ownership. Google sign-in, password reset and email verification are not implemented, because no email sender is configured.

### D2. OpenAI adapter uses `json_object` mode + Zod, not strict `json_schema`
Strict structured outputs require every field to be required, with no unions or optional fields. That doesn't fit the discriminated activity union cleanly. Instead, the adapter embeds the Zod-derived JSON Schema (`z.toJSONSchema`) in the prompt, requests `response_format: json_object`, validates with Zod and semantic validators, and makes **one** repair call that lists the validation errors. It works with any OpenAI-compatible endpoint. The SDK's own retries are disabled; the adapter retries transient errors (429, 5xx, timeouts) twice with jittered backoff.

### D3. The dev model also activates when no API key is set (non-production only)
This makes `npm run dev` work out of the box. A yellow banner, a label on every generated piece of content, and `provider: "mock"` in the stored `model_info_json` make the fallback obvious. With `NODE_ENV=production` and no key, startup fails instead.

### D4. Model calls inside row-locked transactions
Draft advancement and session `next` hold a `SELECT … FOR UPDATE` on the draft or session row while calling the model. This gives exactly-once semantics under double clicks and concurrent tabs, with very little code. The cost is that a connection is held for the length of the model call (timeout 45s, pool of 10). At higher scale, the alternative is claim-by-version: bump the version, call the model outside the transaction, then apply only if the version still matches.

### D5. Free-response grading is two-phase
The submission is committed first (`pending_evaluation`). The model then grades outside any transaction. Evidence, mastery and review updates are written together in a second transaction, guarded by `status = 'pending_evaluation'`. A model failure never loses the learner's answer, and retrying with the same idempotency key resumes grading.

### D6. One attempt per activity
`attempts.activity_id` is UNIQUE. A retry after a miss happens through a fresh variant: the planner chooses remediate → check. The answer is never resubmitted to the same item. This also makes double submits with different keys idempotent.

### D7. Predictions count as evidence but not as the post-teaching check
A low-stakes prediction comes before teaching, as spec §19 requires. Its result is stored as evidence. A lucky guess can't stand in for the post-teaching check, though: the planner's per-concept counters ignore `purpose = 'prediction'`. A prediction miss doesn't trigger remediation, because teaching comes next anyway.

### D8. Readiness uses the concepts required by the *current* curriculum version
A goal revision appends a goal version and a curriculum version. That curriculum version lists `required_slugs`: kept concepts plus new ones. Earlier concepts and all their evidence stay; the outline labels them "From an earlier goal". Readiness is computed only over the required set, so it changes against the new goal without deleting anything.

### D9. Display status "Review due" is computed when read
`mastery_estimates.status` stores only `not_assessed`, `developing` or `demonstrated`. The "review due" overlay is computed on read from `review_items.due_at` (the spec's "lazy due review calculation"). Due dates are absolute UTC timestamps and are shown in the profile's time zone.

### D10. Review sessions vs lessons
If reviews are due, starting a session defaults to a **review** session: up to 3 due concepts, alternating multiple-choice and free-response variants. The learner can choose "Learn something new instead". If a different session kind is explicitly requested while one is open, the open session is closed. Its records persist.

### D11. Telemetry and model usage go to Postgres tables
`telemetry_events` holds the spec's event names with non-sensitive properties. `model_usage` holds per-call metadata and backs the per-user rate limit and daily budget. No third-party analytics.

### D12. Curiosity progress shows counts, never a denominator
"You've explored N ideas and opened M branches." There is no "N of M", so nothing reads as percent-complete for open-ended subjects (invariant 9).

### Unresolved (as in spec §18)
The consumer label for course subsections, how reminders get delivered, graph visualization, calibration of confidence, verified retrieval and citation thresholds, and a sandboxed code runner.
