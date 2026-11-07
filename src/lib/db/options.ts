
/**
 * Connection options that work locally and on Supabase/Vercel.
 * - Supabase's transaction pooler (port 6543) doesn't support prepared statements → prepare: false.
 * - Any non-local host gets TLS (Supabase requires it). Override with DB_SSL=disable|require.
 * - Serverless functions keep pools small; many instances share the pooler. Override with DB_POOL_MAX.
 */
export function connectionOptions(databaseUrl: string, defaults: { max?: number } = {}): { max: number; ssl: false | "require"; prepare: boolean; onnotice: () => void } {
  const url = new URL(databaseUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const transactionPooler = url.port === "6543" || url.searchParams.get("pgbouncer") === "true";
  const sslEnv = process.env.DB_SSL;
  const ssl: false | "require" = sslEnv === "disable" ? false : sslEnv === "require" || !local ? "require" : false;
  const max = Number(process.env.DB_POOL_MAX) || defaults.max || (process.env.VERCEL ? 3 : 10);
  return { max, ssl, prepare: !transactionPooler, onnotice: () => {} };
}
