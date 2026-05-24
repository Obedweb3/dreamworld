'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface ScannerProps {
  onDetected: (code: string) => void
}

export default function Scanner({ onDetected }: ScannerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef    = useRef<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null)
  const lastCode  = useRef('')
  const lastTime  = useRef(0)
  const frameCount = useRef(0)

  const [active,         setActive]         = useState(false)
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [status,         setStatus]         = useState<'idle'|'starting'|'scanning'|'detected'>('idle')
  const [detectedCode,   setDetectedCode]   = useState('')
  const [error,          setError]          = useState('')
  const [lowLight,       setLowLight]       = useState(false)
  const [confidence,     setConfidence]     = useState(0) // scan line feedback

  const stopScanner = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (readerRef.current) { try { readerRef.current.reset() } catch {} readerRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false); setTorchOn(false); setStatus('idle')
    setLowLight(false); setConfidence(0); setDetectedCode('')
  }, [])

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {}
  }, [torchOn])

  /* Sharpen + enhance contrast on canvas for better barcode reading */
  const enhanceForBarcode = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Crop just the center region where barcode is likely
    const cropX = Math.floor(w * 0.05)
    const cropY = Math.floor(h * 0.25)
    const cropW = Math.floor(w * 0.90)
    const cropH = Math.floor(h * 0.50)
    const imgData = ctx.getImageData(cropX, cropY, cropW, cropH)
    const d = imgData.data

    // Convert to grayscale + increase contrast
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
      // Stretch contrast: push darks darker, lights lighter
      const enhanced = Math.min(255, Math.max(0, (gray - 100) * 1.8 + 100))
      d[i] = d[i+1] = d[i+2] = enhanced
    }
    ctx.putImageData(imgData, cropX, cropY)

    // Measure brightness for low-light detection
    let sum = 0
    for (let i = 0; i < d.length; i += 16) sum += d[i]
    return sum / (d.length / 16)
  }

  /* Draw scan line animation on overlay canvas */
  const drawOverlay = useCallback((w: number, h: number, detected: boolean) => {
    const oc = overlayRef.current
    if (!oc) return
    oc.width = w; oc.height = h
    const ctx = oc.getContext('2d')
    if (!ctx) return

    const bx = w * 0.06, by = h * 0.28, bw = w * 0.88, bh = h * 0.44

    // dim surround
    ctx.fillStyle = 'rgba(0,0,0,0.48)'
    ctx.fillRect(0, 0, w, h)
    ctx.clearRect(bx, by, bw, bh)

    // border
    ctx.strokeStyle = detected ? '#00ff88' : '#00a650'
    ctx.lineWidth = detected ? 3 : 2
    ctx.strokeRect(bx, by, bw, bh)

    // corner brackets
    const cs = 22, cw = detected ? 4 : 3
    ctx.strokeStyle = detected ? '#00ff88' : '#00a650'
    ctx.lineWidth = cw
    const corners = [
      [bx, by, bx+cs, by, bx, by+cs],
      [bx+bw, by, bx+bw-cs, by, bx+bw, by+cs],
      [bx, by+bh, bx+cs, by+bh, bx, by+bh-cs],
      [bx+bw, by+bh, bx+bw-cs, by+bh, bx+bw, by+bh-cs],
    ]
    corners.forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x1,y1); ctx.lineTo(x3,y3); ctx.stroke()
    })

    if (!detected) {
      // animated scan line
      const t = (Date.now() % 2000) / 2000
      const scanY = by + 4 + (bh - 8) * Math.abs(Math.sin(t * Math.PI))
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(0.3, 'rgba(0,166,80,0.4)')
      grad.addColorStop(0.5, '#00ff88')
      grad.addColorStop(0.7, 'rgba(0,166,80,0.4)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(bx, scanY - 1, bw, 3)

      // glow
      ctx.shadowColor = '#00a650'
      ctx.shadowBlur = 8
      ctx.fillRect(bx, scanY - 1, bw, 2)
      ctx.shadowBlur = 0
    } else {
      // green fill on detection
      ctx.fillStyle = 'rgba(0,255,136,0.12)'
      ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = '#00ff88'
      ctx.font = `bold ${Math.floor(bh * 0.25)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('✓ DETECTED', bx + bw/2, by + bh/2 + 6)
    }
  }, [])

  const startScanner = useCallback(async () => {
    setError(''); setStatus('starting'); setActive(true)
    setDetectedCode(''); setConfidence(0); setLowLight(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          advanced: [{ focusMode: 'continuous' }],
        } as MediaTrackConstraints
      })
      streamRef.current = stream

      const track = stream.getVideoTracks()[0]
      const caps  = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
      setTorchSupported(!!caps.torch)

      // try to set zoom to 1.5x for closer barcode reading
      try {
        const capAny = caps as Record<string, unknown>
        if (capAny.zoom) {
          await track.applyConstraints({ advanced: [{ zoom: 1.5 } as MediaTrackConstraintSet] })
        }
      } catch {}

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Load ZXing with CODE_128 prioritized (Safaricom uses CODE_128)
      const ZX = await import('@zxing/library')
      const hints = new Map()
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
        ZX.BarcodeFormat.CODE_128,  // ← Safaricom ICCID barcode format
        ZX.BarcodeFormat.EAN_13,
        ZX.BarcodeFormat.EAN_8,
        ZX.BarcodeFormat.ITF,
        ZX.BarcodeFormat.CODE_39,
        ZX.BarcodeFormat.CODE_93,
        ZX.BarcodeFormat.UPC_A,
        ZX.BarcodeFormat.UPC_E,
      ])
      hints.set(ZX.DecodeHintType.TRY_HARDER, true)

      const reader = new ZX.BrowserMultiFormatReader(hints)
      readerRef.current = reader
      setStatus('scanning')

      const loop = async () => {
        const video  = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || !readerRef.current) return

        frameCount.current++
        const detected = status === 'detected'

        if (video.readyState >= 2 && video.videoWidth > 0) {
          const vw = video.videoWidth, vh = video.videoHeight
          canvas.width = vw; canvas.height = vh

          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(video, 0, 0)

            // draw animated overlay every frame
            drawOverlay(vw, vh, detected)

            // brightness check every 20 frames
            if (frameCount.current % 20 === 0) {
              const avg = enhanceForBarcode(ctx, vw, vh)
              setLowLight(avg < 55)
              setConfidence(Math.min(100, Math.floor(avg / 2.55)))
            }

            // decode every frame for maximum speed
            try {
              const lum    = new ZX.HTMLCanvasElementLuminanceSource(canvas)
              const hybrid = new ZX.HybridBinarizer(lum)
              const bitmap = new ZX.BinaryBitmap(hybrid)
              const result = readerRef.current.decode(bitmap)

              if (result) {
                const code = result.getText().trim()
                const now  = Date.now()
                // Only fire if code changed or 4s have passed
                if (code && (code !== lastCode.current || now - lastTime.current > 4000)) {
                  lastCode.current = code
                  lastTime.current = now
                  setDetectedCode(code)
                  setStatus('detected')
                  onDetected(code)
                  drawOverlay(vw, vh, true)
                  // resume scanning after 2.5s
                  setTimeout(() => {
                    if (readerRef.current) setStatus('scanning')
                  }, 2500)
                }
              }
            } catch {
              // NotFoundException = no barcode visible yet, perfectly normal
            }
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setError(
        msg.includes('NotAllowed') || msg.includes('Permission')
          ? '❌ Camera permission denied. Please allow camera access in your browser settings.'
          : '❌ Could not start camera: ' + (msg || 'Unknown error')
      )
      setActive(false); setStatus('idle')
    }
  }, [onDetected, drawOverlay, status])

  useEffect(() => () => stopScanner(), [stopScanner])

  return (
    <div>
      {/* ═══ Viewfinder ═══ */}
      <div style={{
        width: '100%', aspectRatio: '4/3', background: '#000',
        borderRadius: 16, overflow: 'hidden', position: 'relative',
        border: status === 'detected' ? '3px solid #00ff88'
              : active               ? '2px solid #333'
              :                        '2px solid #1a1a1a',
        boxShadow: status === 'detected' ? '0 0 0 4px rgba(0,255,136,0.2)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}>
        {/* live video */}
        <video
          ref={videoRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          muted playsInline autoPlay
        />
        {/* hidden processing canvas */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {/* overlay canvas for scan frame */}
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        />

        {/* low light banner */}
        {active && lowLight && !torchOn && (
          <div style={{
            position: 'absolute', top: 10, left: 10, right: 10, zIndex: 10,
            background: 'rgba(0,0,0,0.82)', borderRadius: 10,
            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid rgba(255,215,0,0.4)',
          }}>
            <span style={{ fontSize: 20 }}>🔦</span>
            <div>
              <div style={{ color: '#FFD700', fontSize: 12, fontWeight: 700 }}>Low light detected!</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Tap the torch button to turn on flashlight</div>
            </div>
          </div>
        )}

        {/* torch button inside viewfinder */}
        {active && torchSupported && (
          <button onClick={toggleTorch} style={{
            position: 'absolute', bottom: 14, right: 14, zIndex: 10,
            width: 50, height: 50, borderRadius: '50%', fontSize: 24,
            background: torchOn ? '#FFD700' : 'rgba(0,0,0,0.7)',
            border: torchOn ? '3px solid #FFD700' : '2px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: torchOn ? '0 0 20px rgba(255,215,0,0.8)' : '0 2px 12px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
          }}>🔦</button>
        )}

        {/* idle placeholder */}
        {!active && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 56, opacity: 0.3 }}>📷</div>
            <div style={{ color: '#555', fontSize: 14, fontWeight: 500 }}>Tap Start Scanner below</div>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }`}</style>

      {/* ═══ Controls ═══ */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        {!active ? (
          <button
            className="btn-primary"
            onClick={startScanner}
            style={{ flex: 1, padding: '14px 0', fontSize: 16, fontWeight: 700, borderRadius: 12, letterSpacing: 0.3 }}
          >
            📷 Start Scanner
          </button>
        ) : (
          <>
            <button
              onClick={stopScanner}
              style={{ flex: 1, padding: '14px 0', fontSize: 14, borderRadius: 12 }}
            >
              ⏹ Stop
            </button>
            {torchSupported && (
              <button onClick={toggleTorch} style={{
                padding: '14px 20px', fontSize: 22, borderRadius: 12,
                background: torchOn ? '#FFD700' : undefined,
                borderColor: torchOn ? '#e6c200' : undefined,
                boxShadow: torchOn ? '0 0 14px rgba(255,215,0,0.5)' : undefined,
                transition: 'all 0.2s',
              }}>🔦</button>
            )}
          </>
        )}
      </div>

      {/* ═══ Status bar ═══ */}
      {active && (
        <div style={{
          marginTop: 10, borderRadius: 10, overflow: 'hidden',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{
            padding: '10px 14px',
            background: status === 'detected' ? '#f0fdf4'
                      : status === 'scanning'  ? '#f9fafb'
                      :                          '#fff',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: status === 'detected' ? '#00a650'
                        : status === 'scanning'  ? '#f59e0b'
                        :                          '#9ca3af',
              animation: status === 'scanning' ? 'pulse 1.2s infinite' : 'none',
              boxShadow: status === 'scanning' ? '0 0 6px rgba(245,158,11,0.6)' : 'none',
            }}/>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: status === 'detected' ? '#166534' : status === 'scanning' ? '#92400e' : '#374151',
              }}>
                {status === 'idle'     ? 'Ready'
               : status === 'starting' ? 'Starting camera...'
               : status === 'scanning' ? '🔍 Scanning — point at the barcode'
               :                         '✅ Barcode detected!'}
              </div>
              {status === 'scanning' && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  Hold phone 15–25cm from barcode • Keep steady • Good lighting helps
                </div>
              )}
              {status === 'detected' && detectedCode && (
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#166534', fontWeight: 700, marginTop: 3, wordBreak: 'break-all' }}>
                  {detectedCode}
                </div>
              )}
            </div>
          </div>

          {/* scan quality bar */}
          {status === 'scanning' && (
            <div style={{ padding: '6px 14px 10px', background: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                Light level {lowLight ? '🔴 Low — use flashlight' : '🟢 Good'}
              </div>
              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 99 }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: confidence + '%',
                  background: confidence > 60 ? '#00a650' : confidence > 30 ? '#f59e0b' : '#ef4444',
                  transition: 'width 0.3s, background 0.3s',
                }}/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* error */}
      {error && (
        <div style={{
          marginTop: 10, padding: '12px 14px', borderRadius: 10,
          background: '#fef2f2', border: '1px solid #fca5a5',
          fontSize: 13, color: '#dc2626', fontWeight: 500,
        }}>{error}</div>
      )}
    </div>
  )
}
