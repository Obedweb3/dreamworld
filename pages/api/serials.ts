import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { search, status, page = '1', limit = '30' } = req.query
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
      const lim = parseInt(limit as string)

      // Build filtered queries
      let rows, total, stats

      if (search && status && status !== 'all') {
        const like = `%${search}%`
        const r = await sql`SELECT * FROM sim_serials WHERE (serial ILIKE ${like} OR note ILIKE ${like}) AND status=${status as string} ORDER BY scanned_at DESC LIMIT ${lim} OFFSET ${offset}`
        const c = await sql`SELECT COUNT(*) FROM sim_serials WHERE (serial ILIKE ${like} OR note ILIKE ${like}) AND status=${status as string}`
        rows = r.rows; total = parseInt(c.rows[0].count)
      } else if (search) {
        const like = `%${search}%`
        const r = await sql`SELECT * FROM sim_serials WHERE serial ILIKE ${like} OR note ILIKE ${like} ORDER BY scanned_at DESC LIMIT ${lim} OFFSET ${offset}`
        const c = await sql`SELECT COUNT(*) FROM sim_serials WHERE serial ILIKE ${like} OR note ILIKE ${like}`
        rows = r.rows; total = parseInt(c.rows[0].count)
      } else if (status && status !== 'all') {
        const r = await sql`SELECT * FROM sim_serials WHERE status=${status as string} ORDER BY scanned_at DESC LIMIT ${lim} OFFSET ${offset}`
        const c = await sql`SELECT COUNT(*) FROM sim_serials WHERE status=${status as string}`
        rows = r.rows; total = parseInt(c.rows[0].count)
      } else {
        const r = await sql`SELECT * FROM sim_serials ORDER BY scanned_at DESC LIMIT ${lim} OFFSET ${offset}`
        const c = await sql`SELECT COUNT(*) FROM sim_serials`
        rows = r.rows; total = parseInt(c.rows[0].count)
      }

      const s = await sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='in_stock') as in_stock,
          COUNT(*) FILTER (WHERE status='sold') as sold,
          COUNT(*) FILTER (WHERE status='inactive') as inactive
        FROM sim_serials
      `
      stats = s.rows[0]
      res.json({ rows, total, stats })
    }

    else if (req.method === 'POST') {
      const { serial, note, status = 'in_stock' } = req.body
      if (!serial || serial.trim().length < 8) {
        return res.status(400).json({ error: 'Invalid serial number' })
      }
      const cleaned = serial.trim().replace(/\s+/g, '')
      const result = await sql`
        INSERT INTO sim_serials (serial, note, status)
        VALUES (${cleaned}, ${note || null}, ${status})
        ON CONFLICT (serial) DO NOTHING
        RETURNING *
      `
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Serial already exists', duplicate: true })
      }
      res.json({ ok: true, row: result.rows[0] })
    }

    else if (req.method === 'PATCH') {
      const { id, status, note } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const result = await sql`
        UPDATE sim_serials SET status=${status}, note=${note}, updated_at=NOW()
        WHERE id=${id} RETURNING *
      `
      res.json({ ok: true, row: result.rows[0] })
    }

    else if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Missing id' })
      if (id === 'all') {
        await sql`DELETE FROM sim_serials`
        return res.json({ ok: true, deleted: 'all' })
      }
      await sql`DELETE FROM sim_serials WHERE id=${id as string}`
      res.json({ ok: true })
    }

    else {
      res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
}
