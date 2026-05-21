import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'

const Scanner = dynamic(() => import('../components/Scanner'), { ssr: false })

interface Serial {
  id: number
  serial: string
  status: 'in_stock' | 'sold' | 'inactive'
  note: string | null
  scanned_at: string
  updated_at: string
}

interface Stats {
  total: string
  in_stock: string
  sold: string
  inactive: string
}

type Tab = 'scan' | 'records' | 'export'

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'In Stock',
  sold: 'Sold',
  inactive: 'Inactive',
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  in_stock: { bg: '#dcfce7', color: '#166534' },
  sold: { bg: '#fef9c3', color: '#854d0e' },
  inactive: { bg: '#fee2e2', color: '#991b1b' },
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('scan')
  const [detectedSerial, setDetectedSerial] = useState('')
  const [note, setNote] = useState('')
  const [saveStatus, setSaveStatus] = useState<'in_stock' | 'sold' | 'inactive'>('in_stock')
  const [manualSerial, setManualSerial] = useState('')
  const [records, setRecords] = useState<Serial[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [dbReady, setDbReady] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  async function initDB() {
    await fetch('/api/init', { method: 'POST' })
    setDbReady(true)
  }

  useEffect(() => { initDB() }, [])

  const fetchRecords = useCallback(async () => {
    if (!dbReady) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '30',
        ...(search ? { search } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
      })
      const res = await fetch('/api/serials?' + params)
      const data = await res.json()
      setRecords(data.rows || [])
      setTotal(data.total || 0)
      setStats(data.stats || null)
    } finally {
      setLoading(false)
    }
  }, [dbReady, page, search, filterStatus])

  useEffect(() => { fetchRecords() }, [fetchRecords])
  useEffect(() => { if (tab === 'records') fetchRecords() }, [tab, fetchRecords])

  async function saveSerial(serial: string, noteVal: string, statusVal: string) {
    const res = await fetch('/api/serials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, note: noteVal, status: statusVal }),
    })
    const data = await res.json()
    if (data.duplicate) { showToast('⚠️ Already in database'); return }
    if (data.error) { showToast('Error: ' + data.error); return }
    showToast('✓ Saved: ' + serial.slice(0, 10) + '...')
    fetchRecords()
  }

  function handleDetected(code: string) {
    setDetectedSerial(code)
  }

  async function handleSaveDetected() {
    if (!detectedSerial) return
    await saveSerial(detectedSerial, note, saveStatus)
    setDetectedSerial('')
    setNote('')
    setSaveStatus('in_stock')
  }

  async function handleManualSave() {
    const s = manualSerial.trim()
    if (s.length < 8) { showToast('Serial too short'); return }
    await saveSerial(s, '', 'in_stock')
    setManualSerial('')
  }

  async function updateRecord(id: number, status: string, noteVal: string | null) {
    await fetch('/api/serials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, note: noteVal }),
    })
    fetchRecords()
  }

  async function deleteRecord(id: number) {
    if (!confirm('Delete this serial?')) return
    await fetch('/api/serials?id=' + id, { method: 'DELETE' })
    showToast('Deleted')
    fetchRecords()
  }

  function handleExport() {
    window.open('/api/export', '_blank')
  }

  const LIMIT = 30

  return (
    <>
      <Head>
        <title>SIM Serial Scanner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#00a650" />
      </Head>

      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--white)' }}>
        {/* Header */}
        <div style={{ background: 'var(--green)', padding: '16px 20px 12px', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>DREAMWORD PROJECT</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>SIM Serial Scanner — Safaricom Inventory</div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'var(--border)' }}>
            {[
              { label: 'Total', val: stats.total },
              { label: 'In Stock', val: stats.in_stock },
              { label: 'Sold', val: stats.sold },
              { label: 'Inactive', val: stats.inactive },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--white)', padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--white)' }}>
          {(['scan', 'records', 'export'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '12px 0', border: 'none', borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent',
              borderRadius: 0, background: 'none', color: tab === t ? 'var(--green)' : 'var(--text-muted)',
              fontWeight: tab === t ? 600 : 400, fontSize: 14, textTransform: 'capitalize'
            }}>
              {t === 'scan' ? '📷' : t === 'records' ? '📋' : '⬇️'} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Scan Tab */}
        {tab === 'scan' && (
          <div style={{ padding: '16px 16px 80px' }}>
            <Scanner onDetected={handleDetected} />

            {/* Detected serial */}
            {detectedSerial && (
              <div style={{ background: 'var(--green-light)', border: '1px solid #a7f3d0', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Detected serial (ICCID)</div>
                <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, wordBreak: 'break-all', marginBottom: 12 }}>{detectedSerial}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="text" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
                  <select value={saveStatus} onChange={e => setSaveStatus(e.target.value as typeof saveStatus)}>
                    <option value="in_stock">In Stock</option>
                    <option value="sold">Sold</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" onClick={handleSaveDetected} style={{ flex: 1 }}>✓ Save Serial</button>
                    <button onClick={() => setDetectedSerial('')}>✕ Dismiss</button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual entry */}
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text-muted)' }}>Manual entry</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text" placeholder="Enter serial number manually"
                  value={manualSerial} onChange={e => setManualSerial(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualSave()}
                  maxLength={30}
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={handleManualSave} style={{ whiteSpace: 'nowrap' }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Records Tab */}
        {tab === 'records' && (
          <div style={{ padding: '16px 16px 80px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="search" placeholder="Search serials..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                style={{ flex: 1 }}
              />
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={{ width: 'auto' }}>
                <option value="">All</option>
                <option value="in_stock">In Stock</option>
                <option value="sold">Sold</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>}

            {!loading && records.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                <div>No records found</div>
              </div>
            )}

            {records.map(r => (
              <div key={r.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, wordBreak: 'break-all', flex: 1 }}>{r.serial}</div>
                  <button onClick={() => deleteRecord(r.id)} style={{ padding: '2px 8px', fontSize: 16, color: 'var(--text-muted)', border: 'none', background: 'none', marginLeft: 8 }}>🗑</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...STATUS_COLORS[r.status], fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(r.scanned_at).toLocaleDateString('en-KE')}</span>
                  {r.note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {r.note}</span>}
                </div>
                <select
                  value={r.status}
                  onChange={e => updateRecord(r.id, e.target.value, r.note)}
                  style={{ marginTop: 8, width: 'auto', fontSize: 12, padding: '4px 8px' }}
                >
                  <option value="in_stock">In Stock</option>
                  <option value="sold">Sold</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            ))}

            {/* Pagination */}
            {total > LIMIT && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                <span style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>{page} / {Math.ceil(total / LIMIT)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / LIMIT)}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* Export Tab */}
        {tab === 'export' && (
          <div style={{ padding: '16px 16px 80px' }}>
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Export to CSV</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Download all {stats?.total || 0} serials as a spreadsheet
              </div>
              <button className="btn-primary" onClick={handleExport} style={{ width: '100%' }}>⬇️ Download CSV</button>
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--red)' }}>⚠️ Danger zone</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                This will delete all stored serial records permanently.
              </div>
              <button className="btn-danger" onClick={async () => {
                if (!confirm(`Delete all ${stats?.total} records? Cannot be undone.`)) return
                const res = await fetch('/api/serials?id=all', { method: 'DELETE' })
                if (res.ok) { showToast('All records deleted'); fetchRecords() }
              }} style={{ width: '100%' }}>🗑 Clear all records</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px 16px', borderTop: '1px solid var(--border)', background: 'var(--white)', color: 'var(--text-muted)', fontSize: 13, maxWidth: 480, margin: '0 auto' }}>
        Made by <span style={{ fontWeight: 700, color: 'var(--green)' }}>Obed Tech</span>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111', color: '#fff', padding: '10px 20px', borderRadius: 99,
          fontSize: 14, fontWeight: 500, zIndex: 999, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
        }}>{toast}</div>
      )}
    </>
  )
}
