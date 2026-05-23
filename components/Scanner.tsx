'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface ScannerProps {
  onDetected: (code: string) => void
}

export default function Scanner({ onDetected }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null)
  const lastCodeRef = useRef('')
  const lastTimeRef = useRef(0)

  const [active, setActive] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [status, setStatus] = useState('Press Start to begin scanning')
  const [error, setError] = useState('')

  const stopScanner = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
    if (readerRef.current) {
      try { readerRef.current.reset() } catch {}
      readerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
    setTorchOn(false)
    setStatus('Press Start to begin scanning')
  }, [])

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    try {
      const newState = !torchOn
      await track.applyConstraints({ advanced: [{ torch: newState } as MediaTrackConstraintSet] })
      setTorchOn(newState)
    } catch (e) {
      console.error('Torch error:', e)
    }
  }, [torchOn])

  const startScanner = useCallback(async () => {
    setError('')
    setStatus('Starting camera...')
    setActive(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      })
      streamRef.current = stream

      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
      setTorchSupported(!!capabilities.torch)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library')
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints)
      readerRef.current = reader

      setStatus('📷 Point camera at the barcode')

      const decode = async () => {
        if (!videoRef.current || !canvasRef.current || !readerRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx || video.readyState < 2) {
          animRef.current = requestAnimationFrame(decode)
          return
        }
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        try {
          const luminanceSource = new (await import('@zxing/library')).HTMLCanvasElementLuminanceSource(canvas)
          const binaryBitmap = new (await import('@zxing/library')).BinaryBitmap(
            new (await import('@zxing/library')).HybridBinarizer(luminanceSource)
          )
          const result = readerRef.current.decode(binaryBitmap)
          if (result) {
            const code = result.getText()
            const now = Date.now()
            if (code !== lastCodeRef.current || now - lastTimeRef.current > 3000) {
              lastCodeRef.current = code
              lastTimeRef.current = now
              setStatus('✅ Detected! Review below.')
              onDetected(code)
            }
          }
        } catch {
          // NotFoundException is thrown when no barcode found — this is normal
        }
        animRef.current = requestAnimationFrame(decode)
      }
      animRef.current = requestAnimationFrame(decode)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Camera error'
      setError('Camera error: ' + msg)
      setActive(false)
      setStatus('Press Start to begin scanning')
    }
  }, [onDetected])

  useEffect(() => () => { stopScanner() }, [stopScanner])

  return (
    <div>
      <div style={{
        width: '100%', aspectRatio: '4/3', background: '#000',
        borderRadius: 14, overflow: 'hidden', position: 'relative',
        border: active ? '2.5px solid #00a650' : '2px solid #333',
        boxShadow: active ? '0 0 0 3px rgba(0,166,80,0.2)' : 'none'
      }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} muted playsInline />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {active && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <mask id="scanMask">
                  <rect width="100%" height="100%" fill="white"/>
                  <rect x="14%" y="38%" width="72%" height="24%" rx="8" fill="black"/>
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#scanMask)"/>
            </svg>
            <div style={{ position: 'relative', width: '72%', height: '24%', zIndex: 2 }}>
              {[
                { top: 0, left: 0, borderTop: '3px solid #00a650', borderLeft: '3px solid #00a650' } as React.CSSProperties,
                { top: 0, right: 0, borderTop: '3px solid #00a650', borderRight: '3px solid #00a650' } as React.CSSProperties,
                { bottom: 0, left: 0, borderBottom: '3px solid #00a650', borderLeft: '3px solid #00a650' } as React.CSSProperties,
                { bottom: 0, right: 0, borderBottom: '3px solid #00a650', borderRight: '3px solid #00a650' } as React.CSSProperties,
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: 20, height: 20, borderRadius: 2, ...s }} />
              ))}
              <div style={{
                position: 'absolute', left: 4, right: 4, height: 2,
                background: 'linear-gradient(90deg, transparent, #00a650, transparent)',
                animation: 'scanline 1.8s ease-in-out infinite',
              }} />
            </div>
          </div>
        )}

        {active && torchSupported && (
          <button onClick={toggleTorch} style={{
            position: 'absolute', bottom: 12, right: 12,
            width: 44, height: 44, borderRadius: '50%',
            background: torchOn ? '#FFD700' : 'rgba(0,0,0,0.6)',
            border: torchOn ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.3)',
            color: torchOn ? '#000' : '#fff',
            fontSize: 20, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: torchOn ? '0 0 12px rgba(255,215,0,0.6)' : 'none',
            transition: 'all 0.2s',
          }}>🔦</button>
        )}

        {!active && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ fontSize: 40 }}>📷</div>
            <div style={{ color: '#888', fontSize: 14 }}>Camera off</div>
          </div>
        )}
      </div>

      <style>{`@keyframes scanline { 0%{top:4px;opacity:1} 50%{top:calc(100% - 6px);opacity:1} 100%{top:4px;opacity:1} }`}</style>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {!active ? (
          <button className="btn-primary" onClick={startScanner} style={{ flex: 1, fontSize: 15, padding: '12px 0' }}>
            📷 Start Scanner
          </button>
        ) : (
          <button onClick={stopScanner} style={{ flex: 1, fontSize: 15, padding: '12px 0' }}>
            ⏹ Stop Scanner
          </button>
        )}
        {active && torchSupported && (
          <button onClick={toggleTorch} style={{
            padding: '12px 16px', fontSize: 20,
            background: torchOn ? '#FFD700' : undefined,
            borderColor: torchOn ? '#FFD700' : undefined,
          }}>🔦</button>
        )}
      </div>

      <p style={{ fontSize: 13, textAlign: 'center', marginTop: 8, minHeight: 20, color: error ? '#dc2626' : '#666' }}>
        {error || status}
      </p>
    </div>
  )
}
