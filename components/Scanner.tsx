'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface ScannerProps {
  onDetected: (code: string) => void
}

export default function Scanner({ onDetected }: ScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const rafRef      = useRef<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef   = useRef<any>(null)
  const lastCode    = useRef('')
  const lastTime    = useRef(0)

  const [active,         setActive]         = useState(false)
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [status,         setStatus]         = useState<'idle'|'starting'|'scanning'|'detected'>('idle')
  const [lastDetected,   setLastDetected]   = useState('')
  const [error,          setError]          = useState('')
  const [brightness,     setBrightness]     = useState<'ok'|'low'|''>('')

  /* ── stop everything ── */
  const stopScanner = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (readerRef.current) { try { readerRef.current.reset() } catch {} readerRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current)  { videoRef.current.srcObject = null }
    setActive(false); setTorchOn(false); setStatus('idle'); setBrightness('')
  }, [])

  /* ── torch toggle ── */
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch (e) { console.warn('Torch not supported', e) }
  }, [torchOn])

  /* ── measure average brightness of canvas ── */
  const measureBrightness = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    try {
      const sample = ctx.getImageData(w * 0.25, h * 0.35, w * 0.5, h * 0.3)
      let sum = 0
      for (let i = 0; i < sample.data.length; i += 4) {
        sum += 0.299 * sample.data[i] + 0.587 * sample.data[i+1] + 0.114 * sample.data[i+2]
      }
      return sum / (sample.data.length / 4)
    } catch { return 128 }
  }

  /* ── start scanner ── */
  const startScanner = useCallback(async () => {
    setError(''); setStatus('starting'); setActive(true); setLastDetected('')

    try {
      /* 1. get camera stream — prefer back camera, high res */
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          focusMode: 'continuous' as ConstrainDOMString,
        } as MediaTrackConstraints
      })
      streamRef.current = stream

      /* 2. check torch support */
      const track = stream.getVideoTracks()[0]
      const caps  = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
      setTorchSupported(!!caps.torch)

      /* 3. attach to video */
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      /* 4. load ZXing dynamically */
      const ZX = await import('@zxing/library')
      const hints = new Map()
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
        ZX.BarcodeFormat.CODE_128,
        ZX.BarcodeFormat.EAN_13,
        ZX.BarcodeFormat.EAN_8,
        ZX.BarcodeFormat.ITF,
        ZX.BarcodeFormat.CODE_39,
        ZX.BarcodeFormat.CODE_93,
        ZX.BarcodeFormat.UPC_A,
        ZX.BarcodeFormat.UPC_E,
        ZX.BarcodeFormat.CODABAR,
      ])
      hints.set(ZX.DecodeHintType.TRY_HARDER, true)
      hints.set(ZX.DecodeHintType.ASSUME_GS1, false)

      const reader = new ZX.BrowserMultiFormatReader(hints)
      readerRef.current = reader
      setStatus('scanning')

      let brightCheckFrame = 0

      /* 5. RAF decode loop */
      const loop = async () => {
        const video  = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || !readerRef.current) return

        if (video.readyState >= 2 && video.videoWidth > 0) {
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(video, 0, 0)

            /* brightness check every 30 frames */
            brightCheckFrame++
            if (brightCheckFrame % 30 === 0) {
              const avg = measureBrightness(ctx, canvas.width, canvas.height)
              setBrightness(avg < 60 ? 'low' : 'ok')
            }

            /* decode */
            try {
              const lum    = new ZX.HTMLCanvasElementLuminanceSource(canvas)
              const hybrid = new ZX.HybridBinarizer(lum)
              const bitmap = new ZX.BinaryBitmap(hybrid)
              const result = readerRef.current.decode(bitmap)

              if (result) {
                const code = result.getText().trim()
                const now  = Date.now()
                if (code && (code !== lastCode.current || now - lastTime.current > 4000)) {
                  lastCode.current = code
                  lastTime.current = now
                  setLastDetected(code)
                  setStatus('detected')
                  onDetected(code)
                  /* brief pause then resume scanning */
                  setTimeout(() => { if (readerRef.current) setStatus('scanning') }, 2000)
                }
              }
            } catch {
              /* NotFoundException on every frame without barcode — completely normal */
            }
          }
        }

        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg.includes('Permission') || msg.includes('NotAllowed')
        ? 'Camera permission denied. Please allow camera access and try again.'
        : 'Could not start camera: ' + msg)
      setActive(false)
      setStatus('idle')
    }
  }, [onDetected])

  useEffect(() => () => { stopScanner() }, [stopScanner])

  const statusText = {
    idle:     'Press Start Scanner to begin',
    starting: 'Starting camera...',
    scanning: 'Point camera at the barcode on the SIM package',
    detected: `✅ Detected: ${lastDetected.slice(0, 14)}...`,
  }[status]

  return (
    <div>
      {/* ── Viewfinder ── */}
      <div style={{
        width: '100%', aspectRatio: '4/3',
        background: '#0a0a0a', borderRadius: 16, overflow: 'hidden',
        position: 'relative',
        border: status === 'detected' ? '2.5px solid #00a650'
              : active               ? '2px solid #444'
              :                        '2px solid #222',
        boxShadow: status === 'detected' ? '0 0 0 4px rgba(0,166,80,0.25)' : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        <video
          ref={videoRef}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          muted playsInline autoPlay
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* scan frame + animated line */}
        {active && status !== 'detected' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {/* dim overlay with cutout */}
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <mask id="cut">
                  <rect width="100%" height="100%" fill="white"/>
                  <rect x="12%" y="35%" width="76%" height="30%" rx="10" fill="black"/>
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#cut)"/>
            </svg>

            {/* corner brackets */}
            <div style={{ position: 'relative', width: '76%', height: '30%', zIndex: 2 }}>
              {([
                { top:0, left:0,  borderTop:'3px solid #00a650', borderLeft:'3px solid #00a650'  },
                { top:0, right:0, borderTop:'3px solid #00a650', borderRight:'3px solid #00a650' },
                { bottom:0, left:0,  borderBottom:'3px solid #00a650', borderLeft:'3px solid #00a650'  },
                { bottom:0, right:0, borderBottom:'3px solid #00a650', borderRight:'3px solid #00a650' },
              ] as React.CSSProperties[]).map((s, i) => (
                <div key={i} style={{ position:'absolute', width:22, height:22, ...s }} />
              ))}
              {/* sweeping scan line */}
              <div style={{
                position: 'absolute', left: 6, right: 6, height: 2,
                background: 'linear-gradient(90deg, transparent 0%, #00a650 40%, #00ff88 50%, #00a650 60%, transparent 100%)',
                boxShadow: '0 0 6px #00a650',
                animation: 'sweep 2s ease-in-out infinite',
              }}/>
            </div>
          </div>
        )}

        {/* detected flash overlay */}
        {status === 'detected' && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,166,80,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'flashin 0.2s ease',
          }}>
            <div style={{ background: '#00a650', borderRadius: 12, padding: '12px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>✅</div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginTop: 4 }}>Barcode detected!</div>
            </div>
          </div>
        )}

        {/* torch button — bottom right of viewfinder */}
        {active && torchSupported && (
          <button onClick={toggleTorch} style={{
            position: 'absolute', bottom: 14, right: 14,
            width: 46, height: 46, borderRadius: '50%',
            background: torchOn ? '#FFD700' : 'rgba(0,0,0,0.65)',
            border: torchOn ? '2.5px solid #FFD700' : '2px solid rgba(255,255,255,0.25)',
            fontSize: 22, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: torchOn ? '0 0 16px rgba(255,215,0,0.7)' : '0 2px 8px rgba(0,0,0,0.4)',
            transition: 'all 0.2s', zIndex: 10,
          }} title={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}>
            🔦
          </button>
        )}

        {/* low light warning */}
        {active && brightness === 'low' && !torchOn && (
          <div style={{
            position: 'absolute', top: 12, left: 12, right: 12,
            background: 'rgba(0,0,0,0.75)', borderRadius: 8,
            padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 10,
          }}>
            <span style={{ fontSize: 16 }}>🔦</span>
            <span style={{ color: '#FFD700', fontSize: 12, fontWeight: 600 }}>
              Low light detected — tap the torch button to turn on the flashlight
            </span>
          </div>
        )}

        {/* idle state */}
        {!active && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <div style={{ fontSize: 52, opacity: 0.4 }}>📷</div>
            <div style={{ color: '#666', fontSize: 14 }}>Camera is off</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes sweep {
          0%   { top: 4px;              opacity: 0.8; }
          50%  { top: calc(100% - 6px); opacity: 1;   }
          100% { top: 4px;              opacity: 0.8; }
        }
        @keyframes flashin {
          from { opacity: 0; } to { opacity: 1; }
        }
      `}</style>

      {/* controls row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        {!active ? (
          <button
            className="btn-primary"
            onClick={startScanner}
            style={{ flex: 1, padding: '13px 0', fontSize: 15, fontWeight: 700, borderRadius: 10 }}
          >
            📷 Start Scanner
          </button>
        ) : (
          <>
            <button
              onClick={stopScanner}
              style={{ flex: 1, padding: '13px 0', fontSize: 14, borderRadius: 10 }}
            >
              ⏹ Stop
            </button>
            {torchSupported && (
              <button
                onClick={toggleTorch}
                style={{
                  padding: '13px 18px', fontSize: 20, borderRadius: 10,
                  background: torchOn ? '#FFD700' : undefined,
                  borderColor: torchOn ? '#FFD700' : undefined,
                  boxShadow: torchOn ? '0 0 10px rgba(255,215,0,0.4)' : undefined,
                }}
                title="Toggle flashlight"
              >🔦</button>
            )}
          </>
        )}
      </div>

      {/* status bar */}
      <div style={{
        marginTop: 10, padding: '8px 14px', borderRadius: 8,
        background: error ? '#fef2f2'
                  : status === 'detected' ? '#f0fdf4'
                  : '#f9fafb',
        border: `1px solid ${error ? '#fca5a5' : status === 'detected' ? '#86efac' : '#e5e7eb'}`,
        fontSize: 13, textAlign: 'center',
        color: error ? '#dc2626' : status === 'detected' ? '#166534' : '#6b7280',
        fontWeight: status === 'detected' ? 600 : 400,
        minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {error || statusText}
      </div>
    </div>
  )
}
