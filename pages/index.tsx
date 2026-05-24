import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import dynamic from 'next/dynamic'

const Scanner = dynamic(() => import('../components/Scanner'), { ssr: false })

interface Serial {
  id: number; serial: string; status: 'in_stock'|'sold'|'inactive'
  note: string|null; scanned_at: string; updated_at: string
}
interface Stats { total:string; in_stock:string; sold:string; inactive:string }
type Tab = 'scan'|'records'|'bulk'|'export'

const SC: Record<string,{bg:string;color:string}> = {
  in_stock:{bg:'#dcfce7',color:'#166534'}, sold:{bg:'#fef9c3',color:'#854d0e'}, inactive:{bg:'#fee2e2',color:'#991b1b'}
}
const SL: Record<string,string> = { in_stock:'In Stock', sold:'Sold', inactive:'Inactive' }
const LIMIT = 30

export default function Home() {
  const [tab, setTab]               = useState<Tab>('scan')
  const [editSerial, setEditSerial] = useState('')        // editable serial field
  const [note, setNote]             = useState('')
  const [saveStatus, setSaveStatus] = useState<'in_stock'|'sold'|'inactive'>('in_stock')
  const [manualSerial, setManualSerial] = useState('')
  const [records, setRecords]       = useState<Serial[]>([])
  const [stats, setStats]           = useState<Stats|null>(null)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [bulkText, setBulkText]     = useState('')
  const [bulkResult, setBulkResult] = useState<{saved:number;duplicates:number;errors:number;total:number}|null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [copied, setCopied]         = useState(false)
  const [toast, setToast]           = useState({msg:'',type:'success'})
  const [dbReady, setDbReady]       = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  function showToast(msg:string, type='success') {
    setToast({msg,type})
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(()=>setToast({msg:'',type:'success'}), 3200)
  }

  useEffect(()=>{ fetch('/api/init',{method:'POST'}).then(()=>setDbReady(true)) },[])

  const fetchRecords = useCallback(async()=>{
    if (!dbReady) return
    setLoading(true)
    try {
      const p = new URLSearchParams({page:String(page),limit:String(LIMIT),...(search?{search}:{}),...(filterStatus?{status:filterStatus}:{})})
      const res  = await fetch('/api/serials?'+p)
      const data = await res.json()
      setRecords(data.rows||[]); setTotal(data.total||0); setStats(data.stats||null)
    } finally { setLoading(false) }
  },[dbReady,page,search,filterStatus])

  useEffect(()=>{ fetchRecords() },[fetchRecords])
  useEffect(()=>{ if(tab==='records') fetchRecords() },[tab,fetchRecords])

  async function saveSerial(serial:string, noteVal:string, statusVal:string): Promise<boolean> {
    if (!serial.trim()) { showToast('Serial is empty','error'); return false }
    setSaving(true)
    try {
      const res  = await fetch('/api/serials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serial:serial.trim(),note:noteVal,status:statusVal})})
      const data = await res.json()
      if (data.duplicate) { showToast('⚠️ Already in database','warning'); return false }
      if (data.error)     { showToast('❌ '+data.error,'error'); return false }
      showToast('✅ Saved: '+serial.trim().slice(0,14)+'...')
      fetchRecords(); return true
    } finally { setSaving(false) }
  }

  function handleDetected(code:string) {
    setEditSerial(code); setNote(''); setSaveStatus('in_stock')
  }

  async function handleSubmit() {
    const ok = await saveSerial(editSerial, note, saveStatus)
    if (ok) { setEditSerial(''); setNote('') }
  }

  async function handleManualSave() {
    const s = manualSerial.trim()
    if (s.length<8) { showToast('Serial too short','error'); return }
    const ok = await saveSerial(s,'','in_stock')
    if (ok) setManualSerial('')
  }

  function copySerial() {
    if (!editSerial) return
    navigator.clipboard.writeText(editSerial).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) })
  }

  async function handleBulkImport() {
    const lines = bulkText.split(/[\n,;]+/).map(s=>s.trim()).filter(s=>s.length>=8)
    if (!lines.length) { showToast('No valid serials found','error'); return }
    setBulkLoading(true); setBulkResult(null)
    try {
      const res  = await fetch('/api/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serials:lines})})
      const data = await res.json()
      setBulkResult(data)
      if (data.saved>0) { showToast(`✅ Imported ${data.saved} serials`); fetchRecords() }
    } finally { setBulkLoading(false) }
  }

  async function updateRecord(id:number, status:string, noteVal:string|null) {
    await fetch('/api/serials',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status,note:noteVal})})
    fetchRecords()
  }

  async function deleteRecord(id:number) {
    if (!confirm('Delete this serial?')) return
    await fetch('/api/serials?id='+id,{method:'DELETE'})
    showToast('Deleted'); fetchRecords()
  }

  const toastBg = toast.type==='warning'?'#d97706':toast.type==='error'?'#dc2626':'#00a650'

  const TABS: {key:Tab;icon:string;label:string}[] = [
    {key:'scan',   icon:'📷',label:'Scan'},
    {key:'records',icon:'📋',label:'Records'},
    {key:'bulk',   icon:'📥',label:'Bulk'},
    {key:'export', icon:'⬇️',label:'Export'},
  ]

  return (
    <>
      <Head>
        <title>DREAMWORD PROJECT</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
        <meta name="theme-color" content="#00a650"/>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
      </Head>

      <div style={{maxWidth:480,margin:'0 auto',minHeight:'100dvh',background:'#fff',display:'flex',flexDirection:'column'}}>

        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#00a650,#007a3a)',padding:'14px 18px 12px',boxShadow:'0 2px 10px rgba(0,0,0,0.2)',position:'sticky',top:0,zIndex:20}}>
          <div style={{color:'#fff',fontSize:20,fontWeight:900,letterSpacing:2}}>DREAMWORD PROJECT</div>
          <div style={{color:'rgba(255,255,255,0.82)',fontSize:11,marginTop:2}}>Safaricom SIM Serial Scanner • Obed Tech</div>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid #e5e7eb'}}>
            {[{l:'Total',v:stats.total,c:'#1f2937'},{l:'Stock',v:stats.in_stock,c:'#166534'},{l:'Sold',v:stats.sold,c:'#854d0e'},{l:'Off',v:stats.inactive,c:'#991b1b'}].map((s,i)=>(
              <div key={s.l} style={{padding:'8px 0',textAlign:'center',borderRight:i<3?'1px solid #e5e7eb':'none'}}>
                <div style={{fontSize:21,fontWeight:800,color:s.c}}>{s.v}</div>
                <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase',letterSpacing:0.5}}>{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid #e5e7eb',position:'sticky',top:66,zIndex:10,background:'#fff'}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              flex:1,padding:'9px 0',border:'none',
              borderBottom:tab===t.key?'2.5px solid #00a650':'2.5px solid transparent',
              borderRadius:0,background:'none',
              color:tab===t.key?'#00a650':'#9ca3af',
              fontWeight:tab===t.key?700:400,fontSize:11,
            }}>
              <div>{t.icon}</div><div>{t.label}</div>
            </button>
          ))}
        </div>

        {/* ═══ SCAN TAB ═══ */}
        {tab==='scan' && (
          <div style={{padding:'14px',flex:1}}>
            {/* Camera — auto-starts */}
            <Scanner onDetected={handleDetected}/>

            {/* ── Capture card — shows when barcode is detected ── */}
            {editSerial && (
              <div style={{
                marginTop:14,
                background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                border:'2px solid #00a650', borderRadius:16, padding:'16px',
                boxShadow:'0 6px 24px rgba(0,166,80,0.18)',
                animation:'slideup 0.22s ease',
              }}>
                {/* title row */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:'#00a650',boxShadow:'0 0 8px rgba(0,166,80,0.7)'}}/>
                    <span style={{fontSize:12,fontWeight:700,color:'#00a650',textTransform:'uppercase',letterSpacing:1}}>
                      Barcode Captured
                    </span>
                  </div>
                  <button onClick={()=>setEditSerial('')} style={{border:'none',background:'none',color:'#9ca3af',fontSize:20,cursor:'pointer',padding:'0 2px',lineHeight:1}}>✕</button>
                </div>

                {/* EDITABLE serial field */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',letterSpacing:0.8,marginBottom:5}}>
                    ICCID Serial — tap to edit if needed
                  </div>
                  <div style={{position:'relative'}}>
                    <input
                      type="text"
                      value={editSerial}
                      onChange={e=>setEditSerial(e.target.value)}
                      style={{
                        fontFamily:'monospace',fontSize:17,fontWeight:800,
                        letterSpacing:1.5,color:'#111',
                        background:'#fff',border:'2px solid #86efac',
                        borderRadius:10,padding:'12px 48px 12px 14px',
                        width:'100%',
                      }}
                    />
                    {/* copy button inside input */}
                    <button
                      onClick={copySerial}
                      style={{
                        position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',
                        border:'none',background:copied?'#00a650':'#f0fdf4',
                        borderRadius:6,padding:'5px 8px',cursor:'pointer',
                        fontSize:14,transition:'all 0.15s',
                        color:copied?'#fff':'#00a650',
                      }}
                      title="Copy serial"
                    >{copied?'✓':'📋'}</button>
                  </div>
                  <div style={{fontSize:11,color:'#9ca3af',marginTop:4}}>
                    {editSerial.length} digits {editSerial.replace(/\D/g,'').length!==editSerial.length && '⚠️ contains non-digits'}
                  </div>
                </div>

                {/* note + status */}
                <div style={{display:'flex',gap:8,marginBottom:12}}>
                  <input
                    type="text"
                    placeholder="Note (e.g. KES 50 • batch #7724)"
                    value={note}
                    onChange={e=>setNote(e.target.value)}
                    style={{flex:1,fontSize:13}}
                  />
                  <select value={saveStatus} onChange={e=>setSaveStatus(e.target.value as typeof saveStatus)} style={{width:'auto',fontSize:13}}>
                    <option value="in_stock">📦 Stock</option>
                    <option value="sold">💰 Sold</option>
                    <option value="inactive">❌ Off</option>
                  </select>
                </div>

                {/* SUBMIT button */}
                <button
                  onClick={handleSubmit}
                  disabled={saving||!editSerial.trim()}
                  style={{
                    width:'100%',padding:'15px 0',fontSize:17,fontWeight:900,
                    borderRadius:12,letterSpacing:0.5,border:'none',cursor:'pointer',
                    background:saving?'#6b7280':'#00a650',color:'#fff',
                    boxShadow:saving?'none':'0 4px 18px rgba(0,166,80,0.45)',
                    transition:'all 0.15s',
                  }}
                >
                  {saving ? '⏳ Saving...' : '💾 SUBMIT & SAVE TO DATABASE'}
                </button>
              </div>
            )}

            {/* manual entry */}
            <div style={{background:'#f9fafb',borderRadius:12,padding:'12px 14px',marginTop:12,border:'1px solid #e5e7eb'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#9ca3af',marginBottom:8,textTransform:'uppercase',letterSpacing:0.8}}>⌨️ Manual entry</div>
              <div style={{display:'flex',gap:8}}>
                <input type="text" placeholder="Type serial number..." value={manualSerial}
                  onChange={e=>setManualSerial(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&handleManualSave()}
                  maxLength={30} style={{flex:1}}/>
                <button className="btn-primary" onClick={handleManualSave} disabled={saving}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RECORDS TAB ═══ */}
        {tab==='records' && (
          <div style={{padding:'14px',flex:1}}>
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <input type="search" placeholder="🔍 Search serials..." value={search}
                onChange={e=>{setSearch(e.target.value);setPage(1)}} style={{flex:1}}/>
              <select value={filterStatus} onChange={e=>{setFilterStatus(e.target.value);setPage(1)}} style={{width:'auto'}}>
                <option value="">All</option>
                <option value="in_stock">In Stock</option>
                <option value="sold">Sold</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {total>0 && <div style={{fontSize:12,color:'#9ca3af',marginBottom:8}}>Showing {records.length} of {total}</div>}
            {loading && <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af'}}>⏳ Loading...</div>}
            {!loading && records.length===0 && (
              <div style={{textAlign:'center',padding:'3rem',color:'#9ca3af'}}>
                <div style={{fontSize:48,marginBottom:8}}>📭</div>
                <div style={{fontWeight:600,color:'#374151'}}>No records yet</div>
                <div style={{fontSize:13,marginTop:4}}>Scan a SIM card to get started</div>
              </div>
            )}
            {records.map(r=>(
              <div key={r.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:'12px 14px',marginBottom:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div style={{fontFamily:'monospace',fontSize:13,fontWeight:700,wordBreak:'break-all',flex:1,letterSpacing:0.5}}>{r.serial}</div>
                  <button onClick={()=>deleteRecord(r.id)} style={{padding:'2px 6px',fontSize:14,color:'#d1d5db',border:'none',background:'none',cursor:'pointer',marginLeft:6}}>🗑</button>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,flexWrap:'wrap'}}>
                  <span style={{...SC[r.status],fontSize:11,padding:'2px 9px',borderRadius:99,fontWeight:600}}>{SL[r.status]}</span>
                  <span style={{fontSize:11,color:'#9ca3af'}}>{new Date(r.scanned_at).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'})}</span>
                  {r.note && <span style={{fontSize:11,color:'#6b7280'}}>· {r.note}</span>}
                </div>
                <select value={r.status} onChange={e=>updateRecord(r.id,e.target.value,r.note)}
                  style={{marginTop:8,width:'auto',fontSize:12,padding:'4px 28px 4px 8px',borderRadius:6}}>
                  <option value="in_stock">📦 In Stock</option>
                  <option value="sold">💰 Sold</option>
                  <option value="inactive">❌ Inactive</option>
                </select>
              </div>
            ))}
            {total>LIMIT && (
              <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:12,marginTop:16,paddingBottom:24}}>
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Prev</button>
                <span style={{fontSize:13,color:'#6b7280'}}>{page} / {Math.ceil(total/LIMIT)}</span>
                <button onClick={()=>setPage(p=>p+1)} disabled={page>=Math.ceil(total/LIMIT)}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ BULK TAB ═══ */}
        {tab==='bulk' && (
          <div style={{padding:'14px',flex:1}}>
            <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:'#0369a1'}}>📥 Bulk Import</div>
              <div style={{fontSize:12,color:'#0284c7'}}>Paste multiple serials — one per line, or comma-separated.</div>
            </div>
            <textarea placeholder={"89254021354292178001\n89254021354292178002\n89254021354292178003"}
              value={bulkText} onChange={e=>setBulkText(e.target.value)}
              rows={10} style={{width:'100%',resize:'vertical',fontFamily:'monospace',fontSize:13,lineHeight:1.7}}/>
            <div style={{fontSize:12,color:'#9ca3af',marginTop:6,marginBottom:12}}>
              {bulkText.split(/[\n,;]+/).filter(s=>s.trim().length>=8).length} valid serials detected
            </div>
            <button className="btn-primary" onClick={handleBulkImport} disabled={bulkLoading||!bulkText.trim()}
              style={{width:'100%',padding:'13px 0',fontSize:15}}>
              {bulkLoading?'⏳ Importing...':'💾 Import All to Database'}
            </button>
            {bulkResult && (
              <div style={{marginTop:14,borderRadius:12,overflow:'hidden',border:'1px solid #e5e7eb'}}>
                <div style={{background:'#00a650',color:'#fff',padding:'10px 14px',fontWeight:700}}>Import Complete</div>
                {[{l:'✅ Saved',v:bulkResult.saved,bg:'#dcfce7',c:'#166534'},{l:'⚠️ Duplicates',v:bulkResult.duplicates,bg:'#fef9c3',c:'#854d0e'},{l:'❌ Errors',v:bulkResult.errors,bg:'#fee2e2',c:'#991b1b'},{l:'📊 Total',v:bulkResult.total,bg:'#f9fafb',c:'#1f2937'}].map(r=>(
                  <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:r.bg,borderTop:'1px solid #e5e7eb'}}>
                    <span style={{fontSize:13,color:r.c}}>{r.l}</span>
                    <span style={{fontSize:15,fontWeight:700,color:r.c}}>{r.v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ EXPORT TAB ═══ */}
        {tab==='export' && (
          <div style={{padding:'14px',flex:1}}>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:12,padding:'20px',marginBottom:14,textAlign:'center'}}>
              <div style={{fontSize:44,marginBottom:10}}>📊</div>
              <div style={{fontWeight:800,fontSize:17,marginBottom:6}}>Export to CSV</div>
              <div style={{fontSize:13,color:'#6b7280',marginBottom:16}}>
                Download all <strong style={{color:'#00a650'}}>{stats?.total||0}</strong> serials as a spreadsheet
              </div>
              <button className="btn-primary" onClick={()=>window.open('/api/export','_blank')}
                style={{width:'100%',padding:'13px 0',fontSize:15}}>⬇️ Download CSV File</button>
            </div>
            {stats && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:14}}>
                {[{l:'Total',v:stats.total,i:'📦',c:'#1f2937',bg:'#f9fafb'},{l:'In Stock',v:stats.in_stock,i:'✅',c:'#166534',bg:'#dcfce7'},{l:'Sold',v:stats.sold,i:'💰',c:'#854d0e',bg:'#fef9c3'},{l:'Inactive',v:stats.inactive,i:'❌',c:'#991b1b',bg:'#fee2e2'}].map(s=>(
                  <div key={s.l} style={{background:s.bg,borderRadius:10,padding:'14px',textAlign:'center',border:'1px solid rgba(0,0,0,0.06)'}}>
                    <div style={{fontSize:26}}>{s.i}</div>
                    <div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{background:'#fff5f5',border:'1px solid #fca5a5',borderRadius:12,padding:'18px'}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:6,color:'#dc2626'}}>⚠️ Danger Zone</div>
              <div style={{fontSize:13,color:'#6b7280',marginBottom:14}}>Delete ALL records permanently. Cannot be undone.</div>
              <button className="btn-danger" onClick={async()=>{
                if(!confirm(`Delete all ${stats?.total} records?`)) return
                await fetch('/api/serials?id=all',{method:'DELETE'})
                showToast('All records deleted','warning'); fetchRecords()
              }} style={{width:'100%',padding:'12px 0'}}>🗑 Clear All Records</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{textAlign:'center',padding:'14px',borderTop:'1px solid #e5e7eb',fontSize:12,color:'#9ca3af'}}>
          Made by <span style={{fontWeight:700,color:'#00a650'}}>Obed Tech</span>
        </div>
      </div>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',
          background:toastBg,color:'#fff',padding:'11px 24px',borderRadius:99,
          fontSize:14,fontWeight:600,zIndex:999,whiteSpace:'nowrap',
          boxShadow:'0 4px 20px rgba(0,0,0,0.25)',animation:'fadein 0.2s ease',
        }}>{toast.msg}</div>
      )}

      <style>{`
        @keyframes slideup { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadein  { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      `}</style>
    </>
  )
}
