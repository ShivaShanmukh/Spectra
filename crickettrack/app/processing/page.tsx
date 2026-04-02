'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import type { SessionStatus } from '@/lib/types'
import { Suspense } from 'react'

function statusToProgress(status: SessionStatus): number {
  switch (status) {
    case 'uploaded':   return 10
    case 'processing': return 55
    case 'complete':   return 100
    case 'failed':     return 0
    default:           return 10
  }
}

function statusToLabel(status: SessionStatus): string {
  switch (status) {
    case 'uploaded':   return 'Queuing session…'
    case 'processing': return 'Detecting ball trajectory…'
    case 'complete':   return 'Analysis complete!'
    case 'failed':     return 'Processing failed'
    default:           return 'Queuing session…'
  }
}

function ProcessingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('sessionId')

  const [status, setStatus] = useState<SessionStatus>('uploaded')
  const [progress, setProgress] = useState(10)
  const [failed, setFailed] = useState(false)
  const targetRef = useRef(10)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const tick = setInterval(() => {
      setProgress(prev => {
        const diff = targetRef.current - prev
        if (Math.abs(diff) < 0.5) return targetRef.current
        return prev + diff * 0.08
      })
    }, 50)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const supabase = getBrowserClient()

    function handleStatus(newStatus: SessionStatus) {
      targetRef.current = statusToProgress(newStatus)
      setStatus(newStatus)
      if (newStatus === 'complete') setTimeout(() => router.push(`/results/${sessionId}`), 1200)
      if (newStatus === 'failed') setFailed(true)
    }

    const channel = supabase.channel(`session-status-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload: { new: { status?: string } }) => { const s = payload.new?.status as SessionStatus; if (s) handleStatus(s) })
      .subscribe()

    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.from('sessions').select('status').eq('id', sessionId).single()
        if (data?.status) {
          handleStatus(data.status as SessionStatus)
          if (data.status === 'complete' || data.status === 'failed') {
            if (pollingRef.current) clearInterval(pollingRef.current)
          }
        }
      } catch { /* keep polling */ }
    }, 2000)

    supabase.from('sessions').select('status').eq('id', sessionId).single()
      .then(({ data }: { data: { status: string } | null }) => { if (data?.status) handleStatus(data.status as SessionStatus) })

    return () => {
      supabase.removeChannel(channel)
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [sessionId, router])

  const circumference = 2 * Math.PI * 100
  const strokeDashoffset = circumference - (progress / 100) * circumference

  const steps = [
    { label: 'Upload',     done: true },
    { label: 'Processing', done: status === 'complete', active: status === 'processing' },
    { label: 'Tracking',   done: status === 'complete', active: status === 'processing' },
    { label: 'Analytics',  done: status === 'complete', active: false },
  ]

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-[390px] h-[844px] bg-[#141414] flex flex-col items-center justify-center relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-[0.05]" viewBox="0 0 390 844" fill="none">
          <rect x="95" y="200" width="200" height="444" stroke="white" strokeWidth="2" />
          <line x1="95" y1="300" x2="295" y2="300" stroke="white" strokeWidth="2" />
          <line x1="95" y1="544" x2="295" y2="544" stroke="white" strokeWidth="2" />
        </svg>

        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-12">
            <p className="text-[#888] text-xs uppercase tracking-[0.2em] font-bold">
              {failed ? 'Processing Failed' : 'Analysing Session'}
            </p>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[240px] h-[240px] rounded-full bg-[#1e1e1e]"></div>
            </div>
            <svg width="280" height="280" viewBox="0 0 220 220" className="relative">
              <circle cx="110" cy="110" r="100" fill="none" stroke="#2a2a2a" strokeWidth="8" />
              <circle cx="110" cy="110" r="100" fill="none" stroke={failed ? '#666' : '#E8413E'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 110 110)"
                style={{ filter: failed ? 'none' : 'drop-shadow(0 0 8px rgba(232,65,62,0.4))' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {failed ? (
                <div className="text-[#888] text-lg font-bold">Failed</div>
              ) : (
                <>
                  <div className="text-[64px] font-black text-white leading-none">{Math.round(progress)}%</div>
                  <div className="text-sm text-[#888] font-medium mt-1">complete</div>
                </>
              )}
            </div>
          </div>

          <div className="mb-8">
            <p className="text-white font-bold text-lg">{statusToLabel(status)}</p>
          </div>

          <div className="flex gap-2 mb-6">
            {steps.map((step, i) => (
              <div key={i} className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 ${step.done ? 'bg-[#E8413E] text-white' : step.active ? 'bg-[#E8413E] text-white animate-pulse' : 'bg-transparent border border-[#333] text-[#888]'}`}>
                {step.label}
                {step.done && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>

          {failed ? (
            <button onClick={() => router.push('/upload')} className="text-[#E8413E] text-sm font-bold hover:underline">
              ← Try again
            </button>
          ) : (
            <p className="text-[#888] text-sm">
              {status === 'uploaded' ? 'Queued — starting shortly…' : '~45 seconds remaining'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#141414]" />}>
      <ProcessingContent />
    </Suspense>
  )
}
