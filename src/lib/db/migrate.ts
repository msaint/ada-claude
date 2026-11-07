import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { connectionOptions } from "./options";

/** Applies db/migrations/*.sql in order, tracking them in schema_migrations. */
export async function migrate(databaseUrl: string, opts: { reset?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  await ensureDatabase(databaseUrl, log);
  const sql = postgres(databaseUrl, connectionOptions(databaseUrl, { max: 1 }));
  try {
    if (opts.reset) {
      await sql.unsafe("drop schema public cascade; create schema public;");
      log("schema reset");
    }
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.resolve(process.cwd(), "db/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = fs.readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

async function ensureDatabase(databaseUrl: string, log: (m: string) => void) {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error("Unsupported database name");
  url.pathname = "/postgres";
  const admin = postgres(url.toString(), { ...connectionOptions(databaseUrl, { max: 1 }), connect_timeout: 10 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) {
      await admin.unsafe(`create database "${dbName}"`);
      log(`created database ${dbName}`);
    }
  } catch {
    // No permission to inspect/create databases (e.g. hosted Postgres) — assume it exists.
  } finally {
    await admin.end();
  }
}
