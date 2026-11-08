# Implementation status

Last updated: 2026-11-07. Legend: ✅ done and tested · 🟡 partial · ⛔ blocked · ⏭️ deferred (P1 or out of scope)

## Verification run (this commit)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass |
| `npm run lint` | ✅ pass (0 errors, 0 warnings) |
| `npm test` | ✅ 100/100: unit (policies, adapter, DTO, components) + integration (route handlers against Postgres) |
| `npm run build` | ✅ pass |
| `npm run test:e2e` | ✅ 8/8 Playwright: guest-first journey, curiosity journey, goal journey, sidebar and deletion, failure/retry, keyboard-only, mobile drawer, cross-user URL |
| `npm run smoke:model` (real model) | ⛔ **not run** for either provider. No OpenAI or Anthropic key is available here, and this sandbox's network policy blocks `api.openai.com`. The adapter is covered by transport-level tests (valid output, malformed JSON → repair, cyclic graph → repair → clean failure, 429/5xx retry, timeout, non-transient error, kind enforcement). **Run it before relying on real-model quality.** |

All E2E and integration runs use the **deterministic development model**. They prove the system end to end, not the quality of real AI teaching.

## Guest mode (try before sign-up)
- ✅ Start a course with no account; guest banner; one-course limit and guest model budget (`account_required` → account dialog); sign-up keeps guest data in place; sign-in moves it into the existing account; per-IP guest creation limit; stale guest purge; guest data deletion. Covered by `tests/integration/guest.test.ts` and `tests/e2e/guest.spec.ts`.
- 🟡 Stale guests are purged only when new guests arrive (no scheduled job yet).

## Reading learner links
- ✅ Claude server-side web fetch during setup for links in the learner's text; summary reused across calls and lessons; verified sources stored and shown ("Ada read: …"); calls with links routed to Anthropic when available; pause_turn handled. Covered by `tests/unit/web-fetch.test.ts` and `tests/integration/link-context.test.ts` (fake Claude client).
- ⛔ Not yet exercised against the live Anthropic API (no key in the sandbox). Verify on the Vercel preview with a link-containing topic.

## Deployment support
- ✅ Anthropic transport + OpenAI transport with automatic cross-provider fallback (provider selection and fallback unit-tested; Anthropic transport not exercised against the live API here).
- ✅ Supabase/Vercel-ready DB connections (transaction pooler, TLS, small pools), RLS backstop migration, guided steps in `docs/DEPLOYMENT.md`.

## Slices

### Slice 0: Bootstrap ✅
Next.js 16 + TypeScript strict + Tailwind v4, SQL migrations and runner, env validation (`src/lib/env.ts`), auth, app shell, `/app` home with the prompt and sidebar, README, `.env.example`, and dev/build/lint/typecheck/test/test:e2e scripts.

### Slice 1: Course creation ✅
- ✅ Draft entity. Idempotent creation by key. One question at a time with quick replies plus free text. "Start now" with explicit assumptions. At most 4 questions, enforced on the server. Back, which reopens the last question and invalidates the proposal. Adjust, which recompiles the plan with a free-text request.
- ✅ Optimistic versioning (409 with the latest draft) and duplicate-answer idempotency.
- ✅ Model failure keeps the answers, records an inline retryable error, and retry continues.
- ✅ Curriculum validation (unique slugs, known prerequisites, acyclic, 3–8 target with a hard cap of 30, safe first concept) and atomic conversion: course, goal v1, concepts, edges, curriculum v1 and mastery rows in one transaction. Exactly once (`courses.draft_id` UNIQUE plus a row lock).
- ✅ Curiosity and goal courses coexist. The sidebar lists only courses.

### Slice 2: Course workspace ✅
Header with goal/exploration line, Learn | Outline | Progress tabs, and a goal-change dialog. Outline: indented by prerequisite depth, one status per concept, detail panel with "what you'll learn", evidence and **Study this**, labeled provisional. Learner DTO separated from teacher-only fields (unit and integration tested).

### Slice 3: Learning loop ✅
Server-owned planner (predict → teach → check → apply, remediation, prerequisites, bounded sessions, curiosity reflection). Four safe activity components. Hint and explain-differently (idempotent, capped at 3, mark the attempt assisted). Deterministic MC grading and model rubric grading (`correct/partial/incorrect/uncertain` with per-criterion reasons). Skip records exposure. Append-only evidence. Conservative mastery. Feedback before Continue. Pause and resume of the exact activity. Debounced draft autosave with multi-tab conflict detection. Stale `next` requests are no-ops.

### Slice 4: Retention and goal revision ✅
Review items: one active per concept, +1 day after the first meaningful attempt, then the 1/3/7/14/30 ladder; incorrect resets, partial shortens, assisted doesn't expand. Due queue across courses (`/app/review`), postpone, review sessions with fresh variants. Goal revision: new goal version plus curriculum version, evidence kept, readiness recomputed against the new required set, earlier concepts labeled. Curiosity branches extend the same course graph and can be studied immediately. Progress: readiness bands with a plain-language basis (goal courses); explored counts, open questions and suggested branches with no percentages (curiosity courses); "Not enough evidence yet" when there is little evidence.

### Slice 5: Hardening and delivery 🟡
- ✅ Error envelope with request IDs; validation, auth, conflict, rate-limit and model-timeout codes.
- ✅ Content-Type, body-size (64 KB) and same-origin (CSRF) checks; UUID path validation.
- ✅ Per-user model-call rate limit and daily budget. Usage logged without content. PII-redacting structured logs.
- ✅ Course deletion cascade, data export, account deletion with email confirmation.
- ✅ Authorization regression suite. Idempotency under concurrent requests (draft create, answer, convert, attempt, next).
- ✅ Accessibility: labeled controls, radiogroup semantics, focus moves on transitions (heading or Continue), Escape closes dialogs and drawer, ≥44px targets, reduced motion, no horizontal scroll at 390px.
- 🟡 **No rate limiting on auth endpoints.** Sign-in brute-force throttling should come before a public launch.
- 🟡 No password reset or email verification (no mail provider configured).
- 🟡 Expired auth sessions are not garbage-collected (they are ignored once expired).

## P0 Definition of Done

| Item | Status |
|---|---|
| Running app with README and `.env.example`; build, typecheck, lint and test pass | ✅ |
| Real auth, DB migrations, policies and authorized route handlers | 🟡 Real auth and app-layer authorization, tested. No Postgres RLS (see D1). |
| New account sees a simple prompt and an empty sidebar | ✅ (E2E) |
| Topic triggers adaptive one-at-a-time questions | ✅ (integration + E2E) |
| Arbitrary topic generates a real curriculum from the configured LLM, no topic hardcoding | 🟡 Implemented through the OpenAI adapter with prompts and validation; the dev model is generic with no topic templates. **Not yet verified against a live model** (⛔ above). |
| Draft persists and converts exactly once into a sidebar course | ✅ |
| Distinct curiosity and goal courses work and coexist | ✅ |
| Lessons generated and rendered through safe components | ✅ (sanitized markdown; no HTML, images or scripts; http(s) links only) |
| Respond, get grading/feedback, request hint or alternate explanation | ✅ |
| Correct, incorrect and assisted attempts persist as evidence | ✅ |
| Outline, evidence-based progress and review queue reflect attempts | ✅ |
| Refresh, sign out/in and resume keep state | ✅ |
| Goal edit keeps evidence and creates a goal version | ✅ |
| Delete course and associated learner data | ✅ |
| Security, authorization, idempotency and failure cases covered by tests | ✅ |
| Restrained, accessible, responsive desktop UI | ✅ |
| No fabricated proficiency metric or citations; mocks never presented as AI | ✅ |

## Not implemented / deferred
- ⏭️ Reminders and notifications (P1). Preferences are stored, default off, and email consent requires reminders. Nothing is ever sent.
- ⏭️ Source-grounded retrieval and citations (P1). The `source_references` table exists, but nothing writes to it. Content is labeled AI-generated, and prompts forbid invented URLs.
- ⏭️ Code execution sandbox, graph visualization, adaptive difficulty beyond the planner's difficulty steps, cross-course mentor recommendations (P1).
- ⏭️ Google sign-in.

## Suggested next steps
1. Run `npm run smoke:model` with a real key. Review the output quality for the four topics and tune the prompts in `src/lib/ai/prompts`.
2. Add sign-in throttling, password reset and email verification (pick a mail provider).
3. Decide between Supabase (RLS) and staying on plain Postgres. If Supabase, port the migrations and add policies.
4. P1: reminder delivery (cron worker over `review_items` + `notification_log`, quiet hours, daily cap), plus retrieval with verified citations.
