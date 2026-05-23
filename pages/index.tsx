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
  total: string; in_stock: string; sold: string; inactive: string
}
type Tab = 'scan' | 'records' | 'bulk' | 'export'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  in_stock: { bg: '#dcfce7', color: '#166534' },
  sold:     { bg: '#fef9c3', color: '#854d0e' },
  inactive: { bg: '#fee2e2', color: '#991b1b' },
}
const STATUS_LABELS: Record<string, string> = {
  in_stock: 'In Stock', sold: 'Sold', inactive: 'Inactive',
}
const LIMIT = 30

export default function Home() {
  const [tab, setTab] = useState<Tab>('scan')
  const [detectedSerial, setDetectedSerial] = useState('')
  const [note, setNote]   = useState('')
  const [saveStatus, setSaveStatus] = useState<'in_stock'|'sold'|'inactive'>('in_stock')
  const [manualSerial, setManualSerial] = useState('')
  const [records, setRecords] = useState<Serial[]>([])
  const [stats, setStats]   = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkResult, setBulkResult] = useState<{saved:number;duplicates:number;errors:number;total:number}|null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [toast, setToast] = useState({ msg: '', type: 'success' })
  const [dbReady, setDbReady] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  function showToast(msg: string, type = 'success') {
    setToast({ msg, type })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast({ msg: '', type: 'success' }), 3200)
  }

  useEffect(() => {
    fetch('/api/init', { method: 'POST' }).then(() => setDbReady(true))
  }, [])

  const fetchRecords = useCallback(async () => {
    if (!dbReady) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(LIMIT),
        ...(search ? { search } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
      })
      const res  = await fetch('/api/serials?' + params)
      const data = await res.json()
      setRecords(data.rows  || [])
      setTotal(data.total   || 0)
      setStats(data.stats   || null)
    } finally { setLoading(false) }
  }, [dbReady, page, search, filterStatus])

  useEffect(() => { fetchRecords() }, [fetchRecords])
  useEffect(() => { if (tab === 'records') fetchRecords() }, [tab, fetchRecords])

  async function saveSerial(serial: string, noteVal: string, statusVal: string): Promise<boolean> {
    setSaving(true)
    try {
      const res  = await fetch('/api/serials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, note: noteVal, status: statusVal }),
      })
      const data = await res.json()
      if (data.duplicate) { showToast('⚠️ Already in database', 'warning'); return false }
      if (data.error)     { showToast('❌ ' + data.error, 'error');          return false }
      showToast('✅ Saved: ' + serial.slice(0, 14) + '...')
      fetchRecords()
      return true
    } finally { setSaving(false) }
  }

  function handleDetected(code: string) {
    setDetectedSerial(code)
    setNote('')
    setSaveStatus('in_stock')
  }

  async function handleSaveDetected() {
    if (!detectedSerial) return
    const ok = await saveSerial(detectedSerial, note, saveStatus)
    if (ok) { setDetectedSerial(''); setNote('') }
  }

  async function handleManualSave() {
    const s = manualSerial.trim()
    if (s.length < 8) { showToast('Serial too short', 'error'); return }
    const ok = await saveSerial(s, '', 'in_stock')
    if (ok) setManualSerial('')
  }

  async function handleBulkImport() {
    const lines = bulkText.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.length >= 8)
    if (!lines.length) { showToast('No valid serials found', 'error'); return }
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const res  = await fetch('/api/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serials: lines }),
      })
      const data = await res.json()
      setBulkResult(data)
      if (data.saved > 0) {
        showToast(`✅ Imported ${data.saved} serials`)
        fetchRecords()
        if (data.saved === data.total) setBulkText('')
      }
    } finally { setBulkLoading(false) }
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

  const toastBg =
    toast.type === 'warning' ? '#d97706' :
    toast.type === 'error'   ? '#dc2626' : '#00a650'

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'scan',    label: 'Scan',    icon: '📷' },
    { key: 'records', label: 'Records', icon: '📋' },
    { key: 'bulk',    label: 'Bulk',    icon: '📥' },
    { key: 'export',  label: 'Export',  icon: '⬇️' },
  ]

  return (
    <>
      <Head>
        <title>DREAMWORD PROJECT</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#00a650" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #00a650 0%, #007a3a 100%)',
          padding: '16px 18px 14px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{ color: '#fff', fontSize: 21, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase' }}>
            DREAMWORD PROJECT
          </div>
          <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2, letterSpacing: 0.4 }}>
            Safaricom SIM Serial Scanner
          </div>
        </div>

        {/* ── Stats bar ── */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
            {[
              { label: 'Total',    val: stats.total,    color: '#1f2937' },
              { label: 'In Stock', val: stats.in_stock, color: '#166534' },
              { label: 'Sold',     val: stats.sold,     color: '#854d0e' },
              { label: 'Inactive', val: stats.inactive, color: '#991b1b' },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: '9px 0', textAlign: 'center',
                borderRight: i < 3 ? '1px solid #e5e7eb' : 'none',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', position: 'sticky', top: 68, zIndex: 10 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '10px 0', border: 'none',
              borderBottom: tab === t.key ? '2.5px solid #00a650' : '2.5px solid transparent',
              borderRadius: 0, background: 'none',
              color: tab === t.key ? '#00a650' : '#9ca3af',
              fontWeight: tab === t.key ? 700 : 400, fontSize: 12,
            }}>
              <div>{t.icon}</div>
              <div>{t.label}</div>
            </button>
          ))}
        </div>

        {/* ════════════ SCAN TAB ════════════ */}
        {tab === 'scan' && (
          <div style={{ padding: '16px', flex: 1 }}>
            <Scanner onDetected={handleDetected} />

            {/* Detected serial card */}
            {detectedSerial && (
              <div style={{
                background: '#f0fdf4', border: '1.5px solid #86efac',
                borderRadius: 14, padding: '16px', marginTop: 14,
                boxShadow: '0 2px 8px rgba(0,166,80,0.1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ background: '#00a650', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: 0.5 }}>DETECTED</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>ICCID Serial Number</span>
                </div>
                <div style={{
                  fontFamily: 'monospace', fontSize: 18, fontWeight: 800,
                  wordBreak: 'break-all', color: '#111', letterSpacing: 1,
                  background: '#fff', border: '1px solid #d1fae5',
                  borderRadius: 8, padding: '10px 12px', marginBottom: 12,
                }}>
                  {detectedSerial}
                </div>
                <input
                  type="text"
                  placeholder="Note (optional) — e.g. batch #7724 or KES 50"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <select value={saveStatus} onChange={e => setSaveStatus(e.target.value as typeof saveStatus)} style={{ marginBottom: 12 }}>
                  <option value="in_stock">📦 In Stock</option>
                  <option value="sold">💰 Sold</option>
                  <option value="inactive">❌ Inactive</option>
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-primary"
                    onClick={handleSaveDetected}
                    disabled={saving}
                    style={{ flex: 1, padding: '12px 0', fontSize: 14 }}
                  >
                    {saving ? '⏳ Saving...' : '💾 Save to Database'}
                  </button>
                  <button onClick={() => setDetectedSerial('')} style={{ padding: '12px 16px', color: '#6b7280' }}>✕</button>
                </div>
              </div>
            )}

            {/* Manual entry */}
            <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', marginTop: 14, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                ⌨️ Manual Entry
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Type or paste serial number..."
                  value={manualSerial}
                  onChange={e => setManualSerial(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualSave()}
                  maxLength={30}
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={handleManualSave} disabled={saving}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ RECORDS TAB ════════════ */}
        {tab === 'records' && (
          <div style={{ padding: '16px', flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                type="search"
                placeholder="🔍 Search serials or notes..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                style={{ flex: 1 }}
              />
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={{ width: 'auto' }}>
                <option value="">All</option>
                <option value="in_stock">In Stock</option>
                <option value="sold">Sold</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {total > 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                Showing {records.length} of {total} records
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                Loading records...
              </div>
            )}

            {!loading && records.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
                <div style={{ fontSize: 52, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>No records found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Start scanning SIM cards to populate the database</div>
              </div>
            )}

            {records.map(r => (
              <div key={r.id} style={{
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, wordBreak: 'break-all', flex: 1, letterSpacing: 0.5, color: '#111' }}>
                    {r.serial}
                  </div>
                  <button
                    onClick={() => deleteRecord(r.id)}
                    style={{ padding: '3px 7px', fontSize: 14, color: '#d1d5db', border: 'none', background: 'none', cursor: 'pointer', marginLeft: 6, flexShrink: 0 }}
                  >🗑</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...STATUS_COLORS[r.status], fontSize: 11, padding: '2px 9px', borderRadius: 99, fontWeight: 600 }}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {new Date(r.scanned_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {r.note && <span style={{ fontSize: 11, color: '#6b7280' }}>· {r.note}</span>}
                </div>
                <select
                  value={r.status}
                  onChange={e => updateRecord(r.id, e.target.value, r.note)}
                  style={{ marginTop: 8, width: 'auto', fontSize: 12, padding: '4px 28px 4px 8px', borderRadius: 6 }}
                >
                  <option value="in_stock">📦 In Stock</option>
                  <option value="sold">💰 Sold</option>
                  <option value="inactive">❌ Inactive</option>
                </select>
              </div>
            ))}

            {total > LIMIT && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16, paddingBottom: 24 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
                  {page} / {Math.ceil(total / LIMIT)}
                </span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / LIMIT)}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ════════════ BULK IMPORT TAB ════════════ */}
        {tab === 'bulk' && (
          <div style={{ padding: '16px', flex: 1 }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#0369a1' }}>📥 Bulk Import</div>
              <div style={{ fontSize: 12, color: '#0284c7' }}>
                Paste multiple serial numbers — one per line, or separated by commas. Great for importing from a spreadsheet.
              </div>
            </div>

            <textarea
              placeholder={"Paste serial numbers here, one per line:\n89254021354292178001\n89254021354292178002\n89254021354292178003\n..."}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={10}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}
            />

            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, marginBottom: 14 }}>
              {bulkText.split(/[\n,;]+/).filter(s => s.trim().length >= 8).length} valid serials detected
            </div>

            <button
              className="btn-primary"
              onClick={handleBulkImport}
              disabled={bulkLoading || bulkText.trim().length === 0}
              style={{ width: '100%', padding: '12px 0', fontSize: 15 }}
            >
              {bulkLoading ? '⏳ Importing...' : '💾 Import All to Database'}
            </button>

            {bulkResult && (
              <div style={{ marginTop: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <div style={{ background: '#00a650', color: '#fff', padding: '10px 14px', fontWeight: 700, fontSize: 14 }}>
                  Import Complete
                </div>
                {[
                  { label: '✅ Saved', val: bulkResult.saved, color: '#166534', bg: '#dcfce7' },
                  { label: '⚠️ Duplicates (skipped)', val: bulkResult.duplicates, color: '#854d0e', bg: '#fef9c3' },
                  { label: '❌ Errors', val: bulkResult.errors, color: '#991b1b', bg: '#fee2e2' },
                  { label: '📊 Total processed', val: bulkResult.total, color: '#1f2937', bg: '#f9fafb' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: row.bg, borderTop: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: 13, color: row.color }}>{row.label}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{row.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════ EXPORT TAB ════════════ */}
        {tab === 'export' && (
          <div style={{ padding: '16px', flex: 1 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '22px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📊</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Export to CSV</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
                Download all <strong style={{ color: '#00a650' }}>{stats?.total || 0}</strong> serials as a spreadsheet
              </div>
              <button
                className="btn-primary"
                onClick={() => window.open('/api/export', '_blank')}
                style={{ width: '100%', padding: '13px 0', fontSize: 15 }}
              >
                ⬇️ Download CSV File
              </button>
            </div>

            {/* Summary cards */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Total Serials',  val: stats.total,    icon: '📦', color: '#1f2937', bg: '#f9fafb' },
                  { label: 'In Stock',       val: stats.in_stock, icon: '✅', color: '#166534', bg: '#dcfce7' },
                  { label: 'Sold',           val: stats.sold,     icon: '💰', color: '#854d0e', bg: '#fef9c3' },
                  { label: 'Inactive',       val: stats.inactive, icon: '❌', color: '#991b1b', bg: '#fee2e2' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '14px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 26 }}>{s.icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 12, padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: '#dc2626' }}>⚠️ Danger Zone</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
                Delete ALL stored serial records permanently. This cannot be undone.
              </div>
              <button className="btn-danger" onClick={async () => {
                if (!confirm(`Delete all ${stats?.total} records? This cannot be undone.`)) return
                await fetch('/api/serials?id=all', { method: 'DELETE' })
                showToast('All records deleted', 'warning')
                fetchRecords()
              }} style={{ width: '100%', padding: '12px 0' }}>
                🗑 Clear All Records
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', padding: '14px 16px', borderTop: '1px solid #e5e7eb', fontSize: 12, color: '#9ca3af', background: '#fff' }}>
          Made by <span style={{ fontWeight: 700, color: '#00a650' }}>Obed Tech</span>
        </div>
      </div>

      {/* Toast notification */}
      {toast.msg && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toastBg, color: '#fff', padding: '11px 24px', borderRadius: 99,
          fontSize: 14, fontWeight: 600, zIndex: 999, whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', letterSpacing: 0.2,
          animation: 'fadein 0.2s ease',
        }}>{toast.msg}</div>
      )}

      <style>{`
        @keyframes fadein { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </>
  )
}
