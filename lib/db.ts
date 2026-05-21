import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

export async function query(text: string, params?: unknown[]) {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result
  } finally {
    client.release()
  }
}

export async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS sim_serials (
      id SERIAL PRIMARY KEY,
      serial VARCHAR(30) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
      note TEXT,
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_sim_serials_serial ON sim_serials(serial);
    CREATE INDEX IF NOT EXISTS idx_sim_serials_status ON sim_serials(status);
  `.replace(/\n\s+/g, ' '))
}
