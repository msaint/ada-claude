# Ada

*Ada teaches what no one bothered to make a course for.*

Ada is a course-first learning coach. You type any topic, answer a couple of clarifying questions (one at a time), and Ada creates a **durable course**. The course holds an evolving concept graph, generated lessons, assessment evidence, mastery estimates and spaced reviews. The sidebar lists courses, never chats.

This repository is the P0 web MVP described in [`docs/ADA_CODEX_BUILD_SPEC.md`](docs/ADA_CODEX_BUILD_SPEC.md). See `IMPLEMENTATION_STATUS.md` for what is done, partial or blocked, and `DECISIONS.md` for where it deviates from the spec and why.

## Stack

- **Next.js 16** (App Router, TypeScript strict), React 19, Tailwind CSS v4, lucide icons
- **PostgreSQL 15+** through `postgres` (postgres.js). SQL migrations live in `db/migrations`.
- **Auth:** email + password (scrypt), server-side sessions in Postgres, HttpOnly SameSite=Lax cookie
- **AI:** a `LearningModel` interface (`src/lib/ai/model-adapter.ts`) with **OpenAI** and **Anthropic** transports (either can be primary, the other is an automatic fallback); both: JSON output, Zod validation, one repair retry, retries with jitter, timeouts, per-operation token budgets. There is also a deterministic **development model** for offline dev and tests. Whenever it is active, the UI says so in a banner.
- **Tests:** Vitest (unit + DB integration + React Testing Library), Playwright (E2E)

## Run locally

Prerequisites: Node 20+ and a PostgreSQL 15+ server you can reach.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local` and set `DATABASE_URL`. Then either set `OPENAI_API_KEY` to use real AI, or set `MOCK_MODEL=true` to use the development model.

```bash
npm run db:migrate
```

```bash
npm run dev
```

Open http://localhost:3000, create an account, and type a topic.

If the database in `DATABASE_URL` doesn't exist, `db:migrate` creates it, provided your role is allowed to. `npm run db:reset` drops and recreates the schema.

### Which model is used?

| Setting | Behavior |
|---|---|
| One of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` set | That provider serves every call. |
| Both keys set | `ADA_MODEL_PROVIDER` (default `openai`) is tried first; on timeouts, outages or unusable output the other provider runs the same operation (`ADA_MODEL_FALLBACK=false` to disable). |
| `MOCK_MODEL=true`, or no key outside production | Deterministic development model. A **yellow banner** says the content is placeholder, not real AI. |
| `NODE_ENV=production` with no key and no mock | Startup error. Production never silently falls back. |

Model IDs per operation: `ADA_MODEL_*` (OpenAI) and `ADA_ANTHROPIC_MODEL_*` (Anthropic, default `claude-opus-5-5`). `model_usage` records which provider and model served each call.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (next core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit and integration tests. Integration tests reset and migrate `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/ada_test`). |
| `npm run test:e2e` | Playwright. Resets `ada_e2e`, builds into `.next-e2e`, starts on port 3100 with the dev model, and runs the journeys. Override the database with `E2E_DATABASE_URL`. |
| `npm run db:migrate` / `db:reset` | Apply migrations / reset the schema |
| `npm run smoke:model` | **Manual real-model smoke test.** Needs a provider key; `-- --provider anthropic` or `openai` tests one in isolation. Runs four topics, including an unseen niche one, and prints the clarification, curriculum, activities and grading output for a human to review. Pass your own topics as arguments. |

## Architecture

```
src/app/                 pages (server components fetch via services) + /api/v1 route handlers
src/components/          UI: layout (shell, sidebar), course (setup, header, outline), lesson (player, activities, feedback)
src/lib/api/handler.ts   auth, origin check, JSON/size limits, Zod body validation, UUID params, error envelope
src/lib/services/        domain services: drafts, courses, sessions (learning loop), account; own transactions
src/lib/learning/        pure policies: curriculum validation, next-action planner, mastery, readiness, review scheduler
src/lib/ai/              LearningModel interface, OpenAI adapter, prompts, dev model, budget/rate limiting
src/lib/schemas/         Zod schemas for model output and requests; learner-facing DTO types
db/migrations/           SQL schema (FKs + cascades, append-only evidence trigger, partial unique indexes)
tests/                   unit, integration (route handlers against a real DB), e2e (Playwright)
```

Rules the code follows:

- UI never calls AI directly. Route handlers call services. Services own state transitions and transactions. Adapters own provider calls and validation. The database is the source of truth.
- Model output is an **untrusted proposal**. It is parsed with Zod, checked semantically (unique slugs, known prerequisites, acyclic graph, the requested activity kind), repaired once, then either accepted or reported as a retryable error. Models never supply IDs or owner fields.
- The client never receives `correctChoiceId`, rationale, rubric or `idealAnswerPrivate` for an unanswered activity (`toLearnerActivity`).
- Every query that touches learner data is scoped by `owner_id`, directly or through the parent. A foreign or deleted ID returns 404.

## The learning loop

`POST /courses/:id/sessions` resumes the open session or starts a new one. The server-side planner (`lib/learning/next-action.ts`) picks the next step: **predict → teach → check → apply**, re-teach after a miss, due reviews first, prerequisites respected, sessions kept short, and a closing reflection for curiosity courses. The model generates exactly one validated activity, which renders through four fixed components.

How answers are graded:

- **Multiple choice:** graded deterministically on the server.
- **Free response:** saved first, then graded by the model against a rubric. If grading fails, the answer stays saved as `pending_evaluation` and can be retried.
- **Assistance:** hints and "explain differently" mark the attempt `assisted`.
- **Evidence:** append-only. A database trigger blocks updates.
- **Mastery:** recomputed from the evidence. Demonstrated requires ≥2 independent successes on different activities, one of them at difficulty ≥2.
- **Reviews:** scheduled at +1 day, then +3, +7, +14 and +30 days.

## Deployment

Step-by-step for Vercel + Supabase + OpenAI/Anthropic: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Cloud-only development (where every secret lives, CI, migrations via GitHub Actions): [`docs/CLOUD_DEVELOPMENT.md`](docs/CLOUD_DEVELOPMENT.md).

## Privacy

Ada sends your topic, setup answers and lesson answers to the model provider. It never sends your email or name. Model usage is logged as metadata only (operation, model, latency, tokens). Telemetry events contain no answer text. Users can export their data (`GET /api/v1/account/export`), delete individual courses (cascading), and delete their account (cascading) from Settings. Reminders are off by default and require explicit opt-in; email reminders go only to an address the learner has confirmed, and every one has an unsubscribe link.
