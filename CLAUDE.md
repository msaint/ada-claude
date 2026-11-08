# Ada: notes for Claude sessions

All development happens in the cloud. Nothing depends on a local machine. Where secrets live: `docs/CLOUD_DEVELOPMENT.md`.

## Session environment (Claude Code cloud, environment "Ada")
- The setup script starts a local throwaway Postgres (`postgres:postgres@localhost:5432`), runs `npm ci`, migrates `ada_dev`, and writes `.env.local` with `MOCK_MODEL=true`.
- If Postgres is down (e.g. after the container idled), run: `service postgresql start`.
- The OpenAI key is **not** in the sandbox. It is a network secret on the environment, which the proxy injects into requests to `api.openai.com`. The SDK still needs a placeholder to start:
  `OPENAI_API_KEY=placeholder npm run smoke:model -- --provider openai "Black holes"`
- Claude environments don't accept a user Anthropic key for `api.anthropic.com`, so the Anthropic path is tested on a **Vercel preview deployment** (the key lives in Vercel → Preview env vars) or by the GitHub `Model smoke test` workflow if one is added later. Don't try to put an Anthropic key in the session.
- Never put real secrets in the repo, in `.env.local`, or in the environment's setup script or plain variables.
- Never connect to the production or staging Supabase databases from a session. Schema changes reach them only through the GitHub Actions `Migrate database` workflow.

## Commands
- `npm run lint && npm run typecheck && npm test`: run all three before pushing. Integration tests reset `ada_test`.
- `npm run test:e2e`: Playwright; builds into `.next-e2e` with the dev model.
- `npm run dev`: app on :3000 (dev model unless placeholder keys are set).

## Conventions
- Migrations: add a new numbered file in `db/migrations/`; never edit an applied one. Prefer additive changes, because Vercel may deploy the new code before or after the migration workflow runs.
- Model output is untrusted: validate with the Zod schemas in `src/lib/schemas/model.ts`; never send teacher-only fields to the client.
- Read `IMPLEMENTATION_STATUS.md` and `DECISIONS.md` before larger changes, and update them after.
