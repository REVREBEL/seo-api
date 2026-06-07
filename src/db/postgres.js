import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "DATABASE_URL is not set. Postgres persistence will fail until configured.",
  );
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function testConnection() {
  const result = await query("SELECT now() AS now");
  return result.rows[0];
}

export async function closePool() {
  await pool.end();
}
