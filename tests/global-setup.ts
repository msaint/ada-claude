import { migrate } from "../src/lib/db/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ada_test";
  await migrate(url, { reset: true });
}
