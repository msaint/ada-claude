process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ada_test";
process.env.MOCK_MODEL = "true";
process.env.ADA_SILENT_LOGS = "true";
process.env.ADA_MODEL_CALLS_PER_MINUTE = process.env.ADA_MODEL_CALLS_PER_MINUTE ?? "1000";
process.env.ADA_PREFETCH = process.env.ADA_PREFETCH ?? "sync"; // deterministic: run prefetch inline in tests
