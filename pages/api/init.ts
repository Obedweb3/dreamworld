import type { NextApiRequest, NextApiResponse } from 'next'
import { initDB } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    await initDB()
    res.json({ ok: true, message: 'Database initialized' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
}
