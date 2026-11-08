# Cloud-only development

Goal: develop, test, deploy and migrate from any machine with a browser. No secret or state lives on a laptop.

## Where everything lives

| Thing | Home | Who/what reads it |
|---|---|---|
| Source code | GitHub `msaint/ada-claude` | everyone |
| Production runtime secrets (`DATABASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) | **Vercel → Settings → Environment Variables → Production** | production deployment |
| Preview/staging runtime secrets | **Vercel → Environment Variables → Preview** (staging Supabase, same or separate model keys) | every branch/PR preview deployment |
| Migration credentials | **GitHub → Settings → Environments → `production` / `staging` → secret `MIGRATION_DATABASE_URL`** | `Migrate database` workflow |
| Databases | **Supabase**: two projects, `ada-prod` and `ada-staging` | Vercel + GitHub Actions only |
| OpenAI key for Claude dev sessions | **Claude Code cloud environment "Ada" → Network secrets** (injected by the proxy for `api.openai.com`, never visible in the sandbox) | Claude sessions |
| Anthropic key for testing | **Vercel → Preview** env vars (Claude environments don't accept user keys for Anthropic's own API) | preview deployments |
| Dev/test database for Claude sessions | Throwaway Postgres inside each session (setup script) | that session only |
| Account passwords / 2FA | your password manager (cloud-synced) | you |

## One-time setup

### 1. Supabase: two projects
Create `ada-prod` and `ada-staging` (the free tier allows two). In each: turn the **Data API off** (Project Settings → Data API). Then copy from **Connect**:
- **Transaction pooler URL** (port 6543): Vercel's `DATABASE_URL`.
- **Session pooler URL** (port 5432): GitHub's `MIGRATION_DATABASE_URL`.

### 2. GitHub: environments and secrets
Repository → **Settings → Environments**:
- **New environment** `staging` → **Add environment secret** `MIGRATION_DATABASE_URL` = staging session-pooler URL.
- **New environment** `production` → secret `MIGRATION_DATABASE_URL` = prod session-pooler URL. Optionally add yourself under **Required reviewers**, so every prod migration waits for a click.

Then **Actions → Migrate database → Run workflow**, once with `staging` and once with `production`. That creates the tables, with no laptop involved. After that, any merge to `main` that touches `db/migrations/` migrates production automatically.

### 3. Vercel: project and variables
Import the repo (Add New → Project). Put the Function Region next to your Supabase region. In **Settings → Environment Variables**, add each variable for the scope shown:

| Variable | Production | Preview |
|---|---|---|
| `DATABASE_URL` | prod transaction-pooler URL | staging transaction-pooler URL |
| `OPENAI_API_KEY` | prod key | a separate, lower-limit key (recommended) |
| `ANTHROPIC_API_KEY` | prod key | a separate, lower-limit key (recommended) |
| `ADA_MODEL_PROVIDER` | `anthropic` or `openai` | same |
| `APP_BASE_URL` | `https://<your domain or project>.vercel.app` | leave unset* |
| `ADA_MODEL_TIMEOUT_MS` | `60000` | `60000` |

\*Leaving `APP_BASE_URL` unset only affects whether cookies get the `Secure` flag. On previews, set it to the preview domain if you want that flag there too.

Mark the keys and URLs as **Sensitive** so they can't be read back from the dashboard. Each push to a branch now builds a preview against staging; merging to `main` deploys production.

### 4. Claude Code cloud environment
The "Ada" environment holds:
- **Setup script**: local Postgres, `npm ci`, migrations, dev `.env.local`. No secrets.
- **Network secret**: the OpenAI key for `api.openai.com` (already saved). Enter or rotate it only through the environment's settings, never in chat or the repo.
- **No Anthropic key.** Claude environments don't accept user credentials for Anthropic's own API hosts. To exercise the Anthropic path, push a branch and use its Vercel preview: set `ADA_MODEL_PROVIDER=anthropic` and the Anthropic key in Vercel's Preview scope.

Start a session at claude.ai/code from any machine, choose the `msaint/ada-claude` repo and the "Ada" environment, and work. Push a branch, and Vercel gives you a live preview URL on staging.

## Day-to-day flow
1. Open a Claude Code session (web or mobile) on a new branch.
2. Make changes. `npm run lint && npm run typecheck && npm test` runs in the session; GitHub Actions CI runs it again plus E2E.
3. Push. A Vercel preview deploys against the staging database. If you added a migration, run **Migrate database → staging** first.
4. Merge to `main`. Production deploys, and the migration workflow updates the prod schema.

## Rotating a secret
Change it at the provider, then update Vercel (redeploy), the GitHub environment secret, or the Claude environment's network secret, wherever that value is used. Nothing needs to change in the repo.

## Optional: working outside Claude
If a human wants a full editor in the browser, GitHub Codespaces works with the same repo. Store any keys as **Codespaces secrets** (GitHub → Settings → Codespaces), and run `service postgresql start` (or a Postgres feature) for the local dev DB. `vercel env pull` also works on any machine, but it writes secrets to a local file, which defeats the cloud-only rule. Avoid it.
