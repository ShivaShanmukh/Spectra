'use client'

import { Search, ChevronRight, Upload, Home, BarChart3, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import type { Session, Analytics } from '@/lib/types'

type FilterType = 'ALL' | 'THIS WEEK' | 'THIS MONTH' | 'BEST'

function seedDots(sessionId: string) {
  const hash = sessionId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const colors = ['#E8413E', '#F0A500', '#27AE60', '#4B7BEC']
  return Array.from({ length: 5 }, (_, i) => ({
    x: 40 + ((hash * (i + 1) * 17) % 20),
    y: 25 + ((hash * (i + 1) * 13) % 55),
    color: colors[(hash + i) % colors.length],
  }))
}

function timeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)    return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1)  return 'Yesterday'
  if (days < 7)    return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return '1 week ago'
  return `${weeks} weeks ago`
}

function isWithinDays(iso: string, days: number) {
  return Date.now() - new Date(iso).getTime() < days * 86400000
}

export default function HistoryPage() {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, Analytics>>({})
  const [loading, setLoading] = useState(true)

  const filters: FilterType[] = ['ALL', 'THIS WEEK', 'THIS MONTH', 'BEST']

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.from('sessions').select('*').order('created_at', { ascending: false })
      .then(async ({ data }: { data: Session[] | null }) => {
        const all = (data ?? []) as Session[]
        setSessions(all)
        const complete = all.filter(s => s.status === 'complete')
        const results = await Promise.allSettled(
          complete.map(s =>
            supabase.from('analytics').select('*').eq('session_id', s.id).single()
              .then(({ data: a }: { data: Analytics | null }) => ({ id: s.id, a }))
          )
        )
        const map: Record<string, Analytics> = {}
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.a) map[r.value.id] = r.value.a
        })
        setAnalyticsMap(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const bestSessionId = Object.entries(analyticsMap).sort(
    ([, a], [, b]) => b.line_consistency_pct - a.line_consistency_pct
  )[0]?.[0]

  let filtered = sessions
  if (activeFilter === 'THIS WEEK')  filtered = sessions.filter(s => isWithinDays(s.created_at, 7))
  if (activeFilter === 'THIS MONTH') filtered = sessions.filter(s => isWithinDays(s.created_at, 30))
  if (activeFilter === 'BEST')       filtered = bestSessionId ? sessions.filter(s => s.id === bestSessionId) : []

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(s => s.bowler_name.toLowerCase().includes(q))
  }

  const totalDeliveries = Object.values(analyticsMap).reduce((sum, a) => sum + a.total_deliveries, 0)

  if (loading) return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E8413E] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!loading && sessions.length === 0) return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col relative">
        <div className="px-6 pt-16 pb-6">
          <h1 className="text-[52px] font-black text-white leading-none mb-2">History</h1>
          <p className="text-[#888] text-sm font-medium">0 sessions · 0 deliveries total</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="mb-6 opacity-30">
            <rect x="35" y="50" width="8" height="50" fill="white" />
            <rect x="56" y="50" width="8" height="50" fill="white" />
            <rect x="77" y="50" width="8" height="50" fill="white" />
            <rect x="33" y="48" width="54" height="4" fill="white" rx="2" />
            <rect x="33" y="42" width="54" height="4" fill="white" rx="2" />
            <line x1="20" y1="100" x2="100" y2="100" stroke="white" strokeWidth="2" />
          </svg>
          <h2 className="text-white text-2xl font-bold mb-2">No sessions yet</h2>
          <p className="text-[#888] text-sm mb-8">Upload your first one</p>
          <button onClick={() => router.push('/upload')}
            className="bg-[#E8413E] text-white px-8 py-4 rounded-full font-bold text-base hover:bg-[#f04945] transition-all">
            Upload Session
          </button>
        </div>
        <div className="px-6 pb-8 pt-4 flex-shrink-0">
          <div className="bg-[#1e1e1e] rounded-full px-6 py-4 flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-[#888] hover:text-white transition-colors">
              <Home className="w-6 h-6" strokeWidth={2} />
            </button>
            <button className="text-white"><BarChart3 className="w-6 h-6" strokeWidth={2} /></button>
            <button onClick={() => router.push('/upload')} className="text-[#888] hover:text-white transition-colors">
              <Upload className="w-6 h-6" strokeWidth={2} />
            </button>
            <button className="text-[#888] hover:text-white transition-colors">
              <User className="w-6 h-6" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col overflow-hidden">
        <div className="px-6 pt-16 pb-6 flex-shrink-0">
          <h1 className="text-[52px] font-black text-white leading-none mb-2">History</h1>
          <p className="text-[#888] text-sm font-medium">{sessions.length} sessions · {totalDeliveries} deliveries total</p>
        </div>

        <div className="px-6 mb-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#888]" />
            <input type="text" placeholder="Search sessions..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#1e1e1e] text-white placeholder:text-[#888] pl-12 pr-4 py-3.5 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#E8413E]" />
          </div>
        </div>

        <div className="px-6 mb-4 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {filters.map(filter => (
              <button key={filter} onClick={() => setActiveFilter(filter)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold tracking-wide uppercase transition-all ${activeFilter === filter ? 'bg-white text-[#141414]' : 'bg-transparent border-2 border-white text-white hover:bg-white/10'}`}>
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
          <div className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <p className="text-[#888] text-sm text-center mt-8">No sessions match your filter.</p>
            ) : (
              filtered.map(session => {
                const a = analyticsMap[session.id]
                const isBest = session.id === bestSessionId
                const dots = seedDots(session.id)
                const canViewResults = session.status === 'complete'
                return (
                  <div key={session.id}
                    onClick={() => canViewResults && router.push(`/results/${session.id}`)}
                    className={`bg-[#1e1e1e] rounded-2xl p-4 flex items-center gap-4 transition-colors relative overflow-hidden ${canViewResults ? 'hover:bg-[#252525] cursor-pointer' : 'opacity-70 cursor-default'}`}>
                    {isBest && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E8413E]" />}
                    {isBest && (
                      <div className="absolute top-3 right-3 bg-[#E8413E] px-2 py-1 rounded-full">
                        <span className="text-white text-[9px] font-black tracking-wider uppercase">Best Session</span>
                      </div>
                    )}
                    <div className="flex-shrink-0 w-[80px] h-[80px] bg-[#141414] rounded-xl overflow-hidden">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <rect x="10" y="10" width="80" height="80" fill="#1e1e1e" stroke="#333" strokeWidth="1" />
                        <line x1="10" y1="25" x2="90" y2="25" stroke="#444" strokeWidth="0.5" />
                        <line x1="10" y1="75" x2="90" y2="75" stroke="#444" strokeWidth="0.5" />
                        {session.status === 'complete' ? (
                          dots.map((dot, i) => (
                            <g key={i}>
                              <circle cx={dot.x} cy={dot.y} r="4" fill={dot.color} opacity="0.2" />
                              <circle cx={dot.x} cy={dot.y} r="2" fill={dot.color} />
                            </g>
                          ))
                        ) : (
                          <text x="50" y="55" textAnchor="middle" fill="#666" fontSize="8">
                            {session.status === 'processing' ? 'Processing' : session.status === 'failed' ? 'Failed' : 'Pending'}
                          </text>
                        )}
                      </svg>
                    </div>
                    <div className="flex-1 flex flex-col gap-2 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-bold text-base truncate pr-2">{session.bowler_name}</span>
                        <span className="text-[#888] text-xs font-medium flex-shrink-0">{timeLabel(session.created_at)}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {a ? (
                          <>
                            <div className="bg-[#E8413E] px-2.5 py-1 rounded-full">
                              <span className="text-white text-[10px] font-bold">{a.total_deliveries} deliveries</span>
                            </div>
                            <div className="bg-[#4B7BEC] px-2.5 py-1 rounded-full">
                              <span className="text-white text-[10px] font-bold">{Math.round(a.line_consistency_pct)}% line</span>
                            </div>
                            <div className="bg-[#F0A500] px-2.5 py-1 rounded-full">
                              <span className="text-white text-[10px] font-bold">{Math.round(a.avg_speed)} km/h</span>
                            </div>
                          </>
                        ) : (
                          <div className="bg-[#333] px-2.5 py-1 rounded-full">
                            <span className="text-[#888] text-[10px] font-bold capitalize">{session.status}</span>
                          </div>
                        )}
                      </div>
                      {a && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[#888] text-[10px] font-bold uppercase tracking-wide">Good Length</span>
                            <span className="text-[#888] text-[10px] font-bold">{Math.round(a.length_distribution.good_length * 100)}%</span>
                          </div>
                          <div className="relative h-1 bg-[#141414] rounded-full overflow-hidden">
                            <div className="absolute top-0 left-0 h-full rounded-full bg-[#27AE60]"
                              style={{ width: `${a.length_distribution.good_length * 100}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    {canViewResults && <ChevronRight className="w-5 h-5 text-[#888] flex-shrink-0" />}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="px-6 pb-8 pt-4 flex-shrink-0">
          <div className="bg-[#1e1e1e] rounded-full px-6 py-4 flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-[#888] hover:text-white transition-colors">
              <Home className="w-6 h-6" strokeWidth={2} />
            </button>
            <button className="text-white"><BarChart3 className="w-6 h-6" strokeWidth={2} /></button>
            <button onClick={() => router.push('/upload')} className="text-[#888] hover:text-white transition-colors">
              <Upload className="w-6 h-6" strokeWidth={2} />
            </button>
            <button className="text-[#888] hover:text-white transition-colors">
              <User className="w-6 h-6" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
