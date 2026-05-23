import type { NextApiRequest, NextApiResponse } from 'next'
import { initDB } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await initDB()
    res.json({ ok: true, message: 'Database ready' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
}
