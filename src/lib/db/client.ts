import postgres from "postgres";
import { env } from "@/lib/env";
import { connectionOptions } from "./options";

type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;
export type Db = Sql | Tx;

const globalForDb = globalThis as unknown as { __adaSql?: Sql };

/** Shared connection pool (survives Next.js dev hot reloads). */
export function db(): Sql {
  if (!globalForDb.__adaSql) {
    const url = env().DATABASE_URL;
    globalForDb.__adaSql = postgres(url, {
      ...connectionOptions(url),
      idle_timeout: 20,
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
