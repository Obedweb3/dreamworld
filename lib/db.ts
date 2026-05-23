import { sql } from '@vercel/postgres'

export { sql }

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS sim_serials (
      id SERIAL PRIMARY KEY,
      serial VARCHAR(30) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
      note TEXT,
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_serial ON sim_serials(serial)`
  await sql`CREATE INDEX IF NOT EXISTS idx_status ON sim_serials(status)`
}
