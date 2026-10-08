import pg from "pg";
import { env } from "./config";

let pool: pg.Pool | undefined;

// NUMERIC → JS number (all money values here are small, 2-decimals)
pg.types.setTypeParser(1700, (v) => (v === null ? (v as unknown as number) : parseFloat(v)));
// BIGINT → number (ids and counts stay far below 2^53)
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: env.databaseUrl,
      max: Number(process.env.DB_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = getPool()) {
  return db.query<T>(text, params as any[]);
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
