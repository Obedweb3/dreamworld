import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
    const result = await sql`
      SELECT serial, status, note, scanned_at, updated_at
      FROM sim_serials ORDER BY scanned_at DESC
    `
    const header = ['Serial', 'Status', 'Note', 'Scanned At', 'Updated At']
    const rows = result.rows.map(r => [
      r.serial,
      r.status,
      r.note || '',
      new Date(r.scanned_at).toLocaleString('en-KE'),
      new Date(r.updated_at).toLocaleString('en-KE'),
    ])
    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const date = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="safaricom_serials_${date}.csv"`)
    res.send(csv)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
}
