import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ada_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: `npx tsx scripts/migrate.ts --reset && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: DB,
      MOCK_MODEL: "true",
      APP_BASE_URL: `http://localhost:${PORT}`,
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
