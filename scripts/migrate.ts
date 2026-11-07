import { migrate } from "../src/lib/db/migrate";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}
migrate(url, { reset: process.argv.includes("--reset"), log: (m) => console.log(`[migrate] ${m}`) })
  .then(() => console.log("[migrate] up to date"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
