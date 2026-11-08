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

### D13. Two providers behind one adapter, with cross-provider fallback
`LLMLearningModel` is transport-agnostic: `OpenAITransport` and `AnthropicTransport` each send one request, and the shared adapter does schema embedding, Zod and semantic validation, one repair call, and jittered retries, so both providers are held to identical output contracts. `FallbackLearningModel` retries an operation on the second provider when the first raises a `ModelError` (timeout, outage, invalid output after repair). Rate-limit/budget errors are not masked. The Anthropic transport defaults to `claude-opus-5-5`, enables server-side refusal fallback (`fallbacks: "default"`), and sizes `max_tokens` for adaptive thinking.

### D14. Hosted-Postgres hardening
Migration `0002` enables RLS (no policies) on every table so a hosted Data API (e.g. Supabase PostgREST with the anon key) can read nothing; the app connects as the table owner and is unaffected. The DB client disables prepared statements on Supabase's transaction pooler (port 6543), requires TLS for non-local hosts, and uses small per-instance pools on Vercel. `db:reset` refuses non-local databases.

### D15. Try before signing up: guest users
**Change from the spec:** P0 asked for sign-in first. Visitors can now create their first course immediately.
- **Identity:** submitting the first topic calls `POST /api/v1/auth/guest`, which creates a *guest* user (no email/password) and a 14-day HttpOnly session. All existing ownership checks, idempotency and cascades apply unchanged, because a guest is a normal user row.
- **Limits:** one course per guest, enforced in the service layer with a row lock (`account_required`, HTTP 403), and a smaller daily model budget (`ADA_GUEST_MODEL_CALLS_PER_DAY`, default 60). Any `account_required` response opens an account dialog in the UI.
- **Keeping progress:** sign-up upgrades the guest row in place, so everything is kept. Signing into an existing account reassigns everything the guest owns to that account and deletes the guest.
- **Abuse and cleanup:** guest creation is the one unauthenticated mutation. It is rate-limited per client IP (stored only as a truncated SHA-256, `ADA_GUEST_CREATIONS_PER_HOUR`). Guests whose sessions have all expired are purged with their data, opportunistically on each new guest creation. A scheduled job would make this independent of traffic (P1).

### D16. Reading links learners share (Claude's server-side web fetch)
Learners often explain a goal with links: a job posting, a portfolio, a syllabus. During course setup (clarify, compile, branch), when the learner's text contains a URL that hasn't been summarized yet, the Anthropic transport declares the **server-side `web_fetch_20260209` tool**.
- **Who fetches:** Anthropic fetches the page, so Ada's servers make no outbound requests (no SSRF surface). The tool can only open URLs already present in the conversation, it is limited to 3 fetches per call (`max_content_tokens` 12k), and paused server-tool turns are resumed.
- **Output:** the model writes a ≤2,000-character `link_context` summary, which is stored on the draft and reused by later setup calls (no re-fetch). On conversion it goes into the goal's `baseline_json`, so lesson generation stays tailored, and each page **actually returned by the tool** is saved to `source_references` (`learner_link`). Model-invented URLs are never recorded.
- **Routing:** OpenAI has no equivalent tool on this path. When both keys are set, calls with unread links go to Anthropic first. If only OpenAI is configured, the prompt tells the model to say it couldn't read the link and ask for the key points.
- **Safety:** fetched content is treated as data, never instructions (system prompt). The setup screen shows "Ada read: …" with the real URLs.

### Unresolved (as in spec §18)
The consumer label for course subsections, how reminders get delivered, graph visualization, calibration of confidence, verified retrieval and citation thresholds, and a sandboxed code runner.
