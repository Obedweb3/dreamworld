'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface ScannerProps {
  onDetected: (code: string) => void
}

export default function Scanner({ onDetected }: ScannerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const rafRef     = useRef<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef  = useRef<any>(null)
  const lastCode   = useRef('')
  const lastTime   = useRef(0)
  const frameRef   = useRef(0)

  const [ready,          setReady]          = useState(false)
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [scanning,       setScanning]       = useState(true)
  const [lowLight,       setLowLight]       = useState(false)
  const [lightPct,       setLightPct]       = useState(50)
  const [error,          setError]          = useState('')

  /* ── torch ── */
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {}
  }, [torchOn])

  /* ── overlay: scan frame + sweep line ── */
  const drawOverlay = useCallback((w: number, h: number, flash: boolean) => {
    const oc = overlayRef.current; if (!oc) return
    oc.width = w; oc.height = h
    const ctx = oc.getContext('2d'); if (!ctx) return
    const bx = w*0.04, by = h*0.28, bw = w*0.92, bh = h*0.44
    ctx.clearRect(0,0,w,h)
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(0,0,w,h)
    ctx.clearRect(bx,by,bw,bh)
    // border
    ctx.strokeStyle = flash ? '#00ff88' : '#00a650'
    ctx.lineWidth   = flash ? 3 : 2
    ctx.strokeRect(bx,by,bw,bh)
    // corners
    const cs=24, cw=flash?4:3
    ctx.lineWidth=cw; ctx.strokeStyle=flash?'#00ff88':'#00a650'
    ;[[bx,by,bx+cs,by,bx,by+cs],[bx+bw,by,bx+bw-cs,by,bx+bw,by+cs],
      [bx,by+bh,bx+cs,by+bh,bx,by+bh-cs],[bx+bw,by+bh,bx+bw-cs,by+bh,bx+bw,by+bh-cs]
    ].forEach(([x1,y1,x2,y2,x3,y3])=>{ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x1,y1);ctx.lineTo(x3,y3);ctx.stroke()})
    if (!flash) {
      const t=(Date.now()%1800)/1800
      const sy=by+4+(bh-8)*Math.abs(Math.sin(t*Math.PI))
      const g=ctx.createLinearGradient(bx,0,bx+bw,0)
      g.addColorStop(0,'transparent'); g.addColorStop(0.4,'rgba(0,200,80,0.5)')
      g.addColorStop(0.5,'#00ff88');   g.addColorStop(0.6,'rgba(0,200,80,0.5)')
      g.addColorStop(1,'transparent')
      ctx.fillStyle=g; ctx.shadowColor='#00a650'; ctx.shadowBlur=10
      ctx.fillRect(bx,sy-1,bw,3); ctx.shadowBlur=0
    } else {
      ctx.fillStyle='rgba(0,255,136,0.10)'; ctx.fillRect(bx,by,bw,bh)
    }
  }, [])

  /* ── start camera & ZXing on mount ── */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode:{ideal:'environment'}, width:{ideal:1920,min:640}, height:{ideal:1080,min:480} }
        })
        if (!alive) { stream.getTracks().forEach(t=>t.stop()); return }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        const caps  = track.getCapabilities() as MediaTrackCapabilities & { torch?:boolean }
        setTorchSupported(!!caps.torch)
        try {
          const ca = caps as Record<string,unknown>
          if (ca.zoom) await track.applyConstraints({ advanced:[{zoom:2} as MediaTrackConstraintSet] })
        } catch {}

        if (videoRef.current) { videoRef.current.srcObject=stream; await videoRef.current.play() }

        const ZX = await import('@zxing/library')
        const hints = new Map()
        hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS,[
          ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8,
          ZX.BarcodeFormat.ITF, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.CODE_93,
          ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.CODABAR,
        ])
        hints.set(ZX.DecodeHintType.TRY_HARDER, true)
        readerRef.current = new ZX.BrowserMultiFormatReader(hints)
        if (alive) setReady(true)

        let flash = false
        const loop = () => {
          if (!alive || !videoRef.current || !canvasRef.current || !readerRef.current) return
          const video=videoRef.current, canvas=canvasRef.current
          frameRef.current++
          if (video.readyState>=2 && video.videoWidth>0) {
            canvas.width=video.videoWidth; canvas.height=video.videoHeight
            const ctx=canvas.getContext('2d',{willReadFrequently:true})
            if (ctx) {
              ctx.drawImage(video,0,0)
              drawOverlay(canvas.width,canvas.height,flash)

              // brightness every 25 frames
              if (frameRef.current%25===0) {
                const w=canvas.width,h=canvas.height
                const img=ctx.getImageData(w*0.1,h*0.3,w*0.8,h*0.4)
                let s=0; for(let i=0;i<img.data.length;i+=4) s+=0.299*img.data[i]+0.587*img.data[i+1]+0.114*img.data[i+2]
                const avg=s/(img.data.length/4)
                setLowLight(avg<55); setLightPct(Math.min(100,Math.round(avg/2.55)))

                // contrast boost on every brightness check
                const cd=ctx.getImageData(w*0.04,h*0.28,w*0.92,h*0.44)
                for(let i=0;i<cd.data.length;i+=4){
                  const g=0.299*cd.data[i]+0.587*cd.data[i+1]+0.114*cd.data[i+2]
                  const e=Math.min(255,Math.max(0,(g-100)*2+100))
                  cd.data[i]=cd.data[i+1]=cd.data[i+2]=e
                }
                ctx.putImageData(cd,w*0.04,h*0.28)
              }

              // decode
              try {
                const lum=new ZX.HTMLCanvasElementLuminanceSource(canvas)
                const bitmap=new ZX.BinaryBitmap(new ZX.HybridBinarizer(lum))
                const result=readerRef.current.decode(bitmap)
                if (result) {
                  const code=result.getText().trim()
                  const now=Date.now()
                  if (code && (code!==lastCode.current || now-lastTime.current>4000)) {
                    lastCode.current=code; lastTime.current=now
                    flash=true
                    setScanning(false)
                    onDetected(code)
                    setTimeout(()=>{ flash=false }, 1500)
                  }
                }
              } catch {}
            }
          }
          rafRef.current=requestAnimationFrame(loop)
        }
        rafRef.current=requestAnimationFrame(loop)
      } catch(e:unknown) {
        const m=e instanceof Error?e.message:''
        setError(m.includes('NotAllowed')||m.includes('Permission')
          ? '❌ Camera permission denied. Allow camera in browser settings.'
          : '❌ Camera error: '+m)
      }
    })()
    return () => {
      alive=false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (readerRef.current) { try{readerRef.current.reset()}catch{} }
      if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resumeScanning = () => { lastCode.current=''; setScanning(true) }

  return (
    <div>
      {/* viewfinder */}
      <div style={{
        width:'100%', aspectRatio:'4/3', background:'#000',
        borderRadius:16, overflow:'hidden', position:'relative',
        border: !scanning ? '3px solid #00ff88' : '2px solid #222',
        boxShadow: !scanning ? '0 0 0 4px rgba(0,255,136,0.18)' : 'none',
        transition:'border-color 0.2s,box-shadow 0.2s',
      }}>
        <video ref={videoRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} muted playsInline autoPlay />
        <canvas ref={canvasRef} style={{display:'none'}} />
        <canvas ref={overlayRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />

        {/* loading */}
        {!ready && !error && (
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,background:'rgba(0,0,0,0.7)'}}>
            <div style={{width:36,height:36,border:'3px solid #333',borderTop:'3px solid #00a650',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
            <div style={{color:'#aaa',fontSize:13}}>Starting camera...</div>
          </div>
        )}

        {/* torch button */}
        {ready && torchSupported && (
          <button onClick={toggleTorch} style={{
            position:'absolute',bottom:12,right:12,zIndex:10,
            width:48,height:48,borderRadius:'50%',fontSize:22,
            background:torchOn?'#FFD700':'rgba(0,0,0,0.7)',
            border:torchOn?'3px solid #FFD700':'2px solid rgba(255,255,255,0.2)',
            display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
            boxShadow:torchOn?'0 0 20px rgba(255,215,0,0.8)':'0 2px 8px rgba(0,0,0,0.5)',
            transition:'all 0.2s',
          }}>🔦</button>
        )}

        {/* low light warning */}
        {ready && lowLight && !torchOn && (
          <div style={{position:'absolute',top:10,left:10,right:60,zIndex:10,background:'rgba(0,0,0,0.85)',borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',gap:8,border:'1px solid rgba(255,215,0,0.5)'}}>
            <span style={{fontSize:18}}>🔦</span>
            <div>
              <div style={{color:'#FFD700',fontSize:11,fontWeight:700}}>Low light!</div>
              <div style={{color:'rgba(255,255,255,0.7)',fontSize:10}}>Tap 🔦 to turn on flashlight</div>
            </div>
          </div>
        )}

        {/* resume button when paused */}
        {!scanning && (
          <button onClick={resumeScanning} style={{
            position:'absolute',bottom:12,left:12,zIndex:10,
            padding:'8px 16px',borderRadius:20,fontSize:12,fontWeight:700,
            background:'rgba(0,0,0,0.75)',color:'#fff',border:'1.5px solid rgba(255,255,255,0.3)',cursor:'pointer',
          }}>🔄 Scan next</button>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      {/* status + light bar */}
      {ready && (
        <div style={{marginTop:10,padding:'10px 14px',borderRadius:10,background:'#f9fafb',border:'1px solid #e5e7eb'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <div style={{
              width:9,height:9,borderRadius:'50%',flexShrink:0,
              background:!scanning?'#00a650':'#f59e0b',
              animation:scanning?'pulse 1s infinite':'none',
              boxShadow:scanning?'0 0 6px rgba(245,158,11,0.7)':'0 0 6px rgba(0,166,80,0.6)',
            }}/>
            <span style={{fontSize:13,fontWeight:600,color:!scanning?'#166534':'#92400e'}}>
              {scanning ? '🔍 Scanning — point at barcode from any distance' : '✅ Captured! Review and save below'}
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:10,color:'#9ca3af',width:60,flexShrink:0}}>
              {lowLight?'🔴 Low':'🟢 Good'} light
            </span>
            <div style={{flex:1,height:4,background:'#e5e7eb',borderRadius:99}}>
              <div style={{
                height:'100%',borderRadius:99,
                width:lightPct+'%',
                background:lightPct>60?'#00a650':lightPct>30?'#f59e0b':'#ef4444',
                transition:'width 0.4s,background 0.4s',
              }}/>
            </div>
            <span style={{fontSize:10,color:'#9ca3af',width:28,flexShrink:0}}>{lightPct}%</span>
          </div>
          {scanning && (
            <div style={{fontSize:11,color:'#9ca3af',marginTop:6,textAlign:'center'}}>
              Hold steady • Works from 5cm to 50cm away • No button needed
            </div>
          )}
        </div>
      )}
      {error && (
        <div style={{marginTop:10,padding:'12px 14px',borderRadius:10,background:'#fef2f2',border:'1px solid #fca5a5',fontSize:13,color:'#dc2626',fontWeight:500}}>{error}</div>
      )}
    </div>
  )
}
