'use client'
import { useEffect, useRef, useState } from 'react'

interface ScannerProps {
  onDetected: (code: string) => void
}

export default function Scanner({ onDetected }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('Press Start to scan')
  const [error, setError] = useState('')
  const readerRef = useRef<unknown>(null)
  const lastCodeRef = useRef('')
  const lastTimeRef = useRef(0)

  async function startScanner() {
    setError('')
    setStatus('Starting camera...')
    setActive(true)
    try {
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library')
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.ITF, BarcodeFormat.CODE_39
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints)
      readerRef.current = reader
      await reader.decodeFromVideoDevice(null, videoRef.current!, (result, err) => {
        if (result) {
          const code = result.getText()
          const now = Date.now()
          if (code === lastCodeRef.current && now - lastTimeRef.current < 3000) return
          lastCodeRef.current = code
          lastTimeRef.current = now
          setStatus('✓ Detected: ' + code.slice(0, 12) + '...')
          onDetected(code)
        }
        if (err && err.name !== 'NotFoundException') {
          // ignore common not-found errors during scanning
        }
      })
      setStatus('Point camera at the barcode')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Camera error'
      setError(msg)
      setActive(false)
      setStatus('Press Start to scan')
    }
  }

  function stopScanner() {
    if (readerRef.current) {
      (readerRef.current as { reset: () => void }).reset()
      readerRef.current = null
    }
    setActive(false)
    setStatus('Press Start to scan')
  }

  useEffect(() => () => { stopScanner() }, [])

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        width: '100%', aspectRatio: '4/3', background: '#000',
        borderRadius: 'var(--radius)', overflow: 'hidden', position: 'relative',
        border: active ? '2px solid var(--green)' : '2px solid var(--border)'
      }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
        {active && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{
              width: '72%', height: '22%', border: '2px solid #00a650',
              borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)'
            }} />
          </div>
        )}
        {!active && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#888', fontSize: 14 }}>Camera off</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {!active ? (
          <button className="btn-primary" onClick={startScanner} style={{ flex: 1 }}>📷 Start Camera</button>
        ) : (
          <button onClick={stopScanner} style={{ flex: 1 }}>⏹ Stop Camera</button>
        )}
      </div>

      <p style={{ fontSize: 13, color: error ? 'var(--red)' : 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
        {error || status}
      </p>
    </div>
  )
}
