import type { NextApiRequest, NextApiResponse } from 'next'
import { query } from '../../lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const { search, status, page = '1', limit = '30' } = req.query
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
      const conditions: string[] = []
      const params: unknown[] = []

      if (search) {
        params.push(`%${search}%`)
        conditions.push(`(serial ILIKE $${params.length} OR note ILIKE $${params.length})`)
      }
      if (status && status !== 'all') {
        params.push(status)
        conditions.push(`status = $${params.length}`)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const countResult = await query(`SELECT COUNT(*) FROM sim_serials ${where}`, params)
      const total = parseInt(countResult.rows[0].count)

      const dataParams = [...params, parseInt(limit as string), offset]
      const dataResult = await query(
        `SELECT * FROM sim_serials ${where} ORDER BY scanned_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams
      )

      const statsResult = await query(`
        SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='in_stock') as in_stock,
          COUNT(*) FILTER (WHERE status='sold') as sold,
          COUNT(*) FILTER (WHERE status='inactive') as inactive
        FROM sim_serials
      `)

      res.json({ rows: dataResult.rows, total, stats: statsResult.rows[0] })
    }

    else if (req.method === 'POST') {
      const { serial, note, status = 'in_stock' } = req.body
      if (!serial || serial.trim().length < 8) {
        return res.status(400).json({ error: 'Invalid serial number' })
      }
      const cleaned = serial.trim().replace(/\s+/g, '')
      const result = await query(
        `INSERT INTO sim_serials (serial, note, status) VALUES ($1, $2, $3)
         ON CONFLICT (serial) DO NOTHING RETURNING *`,
        [cleaned, note || null, status]
      )
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Serial already exists', duplicate: true })
      }
      res.json({ ok: true, row: result.rows[0] })
    }

    else if (req.method === 'PATCH') {
      const { id, status, note } = req.body
      if (!id) return res.status(400).json({ error: 'Missing id' })
      const result = await query(
        `UPDATE sim_serials SET status=$1, note=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
        [status, note, id]
      )
      res.json({ ok: true, row: result.rows[0] })
    }

    else if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Missing id' })
      if (id === 'all') {
        await query('DELETE FROM sim_serials')
        return res.json({ ok: true, deleted: 'all' })
      }
      await query('DELETE FROM sim_serials WHERE id=$1', [id])
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
