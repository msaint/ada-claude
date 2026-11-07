import postgres from "postgres";
import { env } from "@/lib/env";

type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;
export type Db = Sql | Tx;

const globalForDb = globalThis as unknown as { __adaSql?: Sql };

/** Shared connection pool (survives Next.js dev hot reloads). */
export function db(): Sql {
  if (!globalForDb.__adaSql) {
    globalForDb.__adaSql = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      onnotice: () => {},
      transform: { undefined: null },
    }) as Sql;
  }
  return globalForDb.__adaSql;
}

export async function closeDb() {
  if (globalForDb.__adaSql) {
    await globalForDb.__adaSql.end({ timeout: 5 });
    globalForDb.__adaSql = undefined;
  }
}

export function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return db().begin(fn) as Promise<T>;
}

/** postgres.js returns jsonb as parsed values; this helper encodes values for jsonb params. */
export function json(value: unknown) {
  return db().json(value as postgres.JSONValue);
}
