// Single shared Postgres pool for the whole process.
// Every module that touches the DB imports this — never `new Pool()` elsewhere.
import "dotenv/config";
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30000, // close our own idle clients before the pooler does
  keepAlive: true,          // TCP keepalive so live clients survive NAT/idle gaps
});

// Supabase's transaction pooler closes idle server connections. When that
// happens to a client sitting idle in our pool, node-postgres emits an 'error'
// on the Pool — and with no listener that becomes an uncaught exception that
// kills the process. Log it in one line and carry on; the pool just opens a
// fresh client on the next query.
pool.on("error", (err) => {
  console.warn(`[pg] idle client dropped (ignored): ${err.message}`);
});

// Network/connection-level failures that should be retried, not treated as a
// real query/logic error (e.g. the inquiry being processed must NOT be failed).
const CONNECTION_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "57P01", // admin_shutdown — server terminated the connection
]);

export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code && CONNECTION_ERROR_CODES.has(e.code)) return true;
  const m = e?.message ?? "";
  return /connection terminated|terminating connection|connection ended|server closed the connection|read ECONNRESET|socket hang up/i.test(
    m
  );
}
