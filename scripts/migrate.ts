import { migrate } from "../src/lib/db/migrate";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();
// Prefer a session-mode/direct URL for DDL; fall back to DATABASE_URL (fine locally).
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (or MIGRATION_DATABASE_URL) is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}
const reset = process.argv.includes("--reset");
if (reset && !/localhost|127\.0\.0\.1/.test(url) && !process.argv.includes("--yes-really")) {
  console.error("Refusing to reset a non-local database. Pass --yes-really if you mean it.");
  process.exit(1);
}
migrate(url, { reset, log: (m) => console.log(`[migrate] ${m}`) })
  .then(() => console.log("[migrate] up to date"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
