# Deploying Ada: Vercel + Supabase + OpenAI/Anthropic

The app runs on Vercel. Supabase provides only the Postgres database: Ada has its own sign-in, and it doesn't use Supabase Auth or Supabase's auto-generated REST/GraphQL API (the "Data API"). OpenAI and/or Anthropic generate lessons, and with both keys set, either one serves as a fallback for the other.

## 1. Create the Supabase project

1. At supabase.com → **New project**. Pick a region (note it for step 4) and save the database password.
2. **Project Settings → Data API**: turn the Data API **off**. Ada doesn't use it. (Migration `0002` also enables row-level security on every table as a backstop.)
3. **Connect** (top bar) → **Connection string**. Copy two URLs, replacing `[YOUR-PASSWORD]`:
   - **Transaction pooler** (port **6543**). This is the app's `DATABASE_URL`.
   - **Session pooler** (port **5432**). Use it for migrations (`MIGRATION_DATABASE_URL`).

   Both have the form `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:<port>/postgres`. URL-encode special characters in the password. The app adds TLS automatically and turns off prepared statements on port 6543.

## 2. Run the migrations (from GitHub Actions)

No local machine is involved. In GitHub, go to **Settings → Environments → New environment `production`** and add the secret `MIGRATION_DATABASE_URL` = the **session pooler** URL. Then go to **Actions → Migrate database → Run workflow → production**. The log should show `applied 0001_init.sql`, `applied 0002_enable_rls.sql`, `up to date`. From then on, merges to `main` that add migrations apply them automatically. For a staging database, see [`CLOUD_DEVELOPMENT.md`](CLOUD_DEVELOPMENT.md).

## 3. Get the model API keys

- **OpenAI:** platform.openai.com → API keys → create a project key. Add billing.
- **Anthropic:** platform.claude.com → API Keys → create a key. Add billing.

Optional: check each key from a Claude Code cloud session before deploying (the keys are stored as the environment's network secrets; see `CLOUD_DEVELOPMENT.md`):

```bash
OPENAI_API_KEY=placeholder npm run smoke:model -- --provider openai "Black holes"
```

```bash
ANTHROPIC_API_KEY=placeholder npm run smoke:model -- --provider anthropic "Black holes"
```

## 4. Create the Vercel project

1. vercel.com → **Add New → Project** → import `msaint/ada-claude`. If you deploy before merging, pick the branch under **Settings → Git**. The framework is detected as Next.js; keep the default build command.
2. **Settings → Functions → Function Region**: choose the region closest to your Supabase region (e.g. Supabase `us-east-1` → Vercel `iad1`). Every request makes several database round trips.
3. **Settings → Environment Variables** (Production, plus Preview if you want previews to work):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** URL (port 6543) |
| `OPENAI_API_KEY` | your OpenAI key |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `ADA_MODEL_PROVIDER` | `anthropic` or `openai`: which one is tried first |
| `APP_BASE_URL` | `https://<your-project>.vercel.app` (or your domain). The `https` turns on Secure cookies. |
| `ADA_MODEL_TIMEOUT_MS` | `60000` |

Optional variables, with defaults:

| Variable | Default |
|---|---|
| `ADA_MODEL_FALLBACK` | `true` (use the other provider on timeouts/outages) |
| `ADA_ANTHROPIC_MODEL_CLARIFY` / `_COMPILE` / `_TUTOR` / `_EVALUATE` | `claude-opus-5-5` |
| `ADA_ANTHROPIC_EFFORT` | model default |
| `ADA_MODEL_CLARIFY` / `_COMPILE` / `_TUTOR` / `_EVALUATE` | `gpt-4.1-mini` / `gpt-4.1` / `gpt-4.1-mini` / `gpt-4.1-mini` |
| `ADA_MODEL_CALLS_PER_MINUTE` / `_PER_DAY` | `20` / `400` per user |
| `DB_POOL_MAX` | `3` per function instance |

**Don't set `MOCK_MODEL`.** In production the app refuses to start without at least one provider key, so the dev model can never serve real users by accident.

4. **Deploy.** Then open the URL, create an account, and type a topic. The yellow "Development model" banner must **not** appear.

## 5. Verify it's using the real models

- Supabase → SQL editor:
  ```sql
  select provider, model, operation, ok, latency_ms, error_code
  from model_usage order by created_at desc limit 20;
  ```
  You should see `anthropic` / `claude-opus-5-5` (or `openai` / `gpt-…`) rows with `ok = true`.
- To test the fallback, temporarily set the primary provider's key to an invalid value and redeploy. Requests should still succeed through the other provider, and the Vercel logs will show a `model_provider_fallback` warning. Restore the key afterwards.

## Notes and limits

- **Function duration:** a curriculum compile can take tens of seconds on a large model at high effort. Vercel's default duration with Fluid compute is enough. If you've lowered it, keep it at or above `ADA_MODEL_TIMEOUT_MS` plus a margin.
- **Connections:** the app holds a database transaction open while it waits for the model during setup and lesson steps (see DECISIONS D4). That's fine at small scale. Under real traffic, watch Supabase's pooler client limits for your plan.
- **Costs:** every activity, hint, explanation and free-response grade is a model call. The per-user minute and day caps are the guardrail. To cut cost, point the high-volume operations at a cheaper model, e.g. `ADA_ANTHROPIC_MODEL_TUTOR=claude-sonnet-5-5` or `claude-haiku-5-5` for hints and activities, and keep `COMPILE` on the strongest model.
- **Custom domain:** add it in Vercel → Domains, then update `APP_BASE_URL`.
