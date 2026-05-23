import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { serials } = req.body as { serials: string[] }
    if (!Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({ error: 'No serials provided' })
    }
    const cleaned = serials
      .map(s => s.trim().replace(/\s+/g, ''))
      .filter(s => s.length >= 8)

    let saved = 0, duplicates = 0, errors = 0

    for (const serial of cleaned) {
      try {
        const result = await sql`
          INSERT INTO sim_serials (serial, status)
          VALUES (${serial}, 'in_stock')
          ON CONFLICT (serial) DO NOTHING
          RETURNING id
        `
        if (result.rows.length > 0) saved++
        else duplicates++
      } catch {
        errors++
      }
    }

    res.json({ ok: true, saved, duplicates, errors, total: cleaned.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
}
