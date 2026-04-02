'use client'

import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import type { Delivery, LengthType } from '@/lib/types'

type FilterType = 'ALL' | 'YORKER' | 'FULL' | 'GOOD LENGTH' | 'SHORT'

const lengthColor: Record<LengthType, string> = {
  yorker:      '#E8413E',
  full:        '#F0A500',
  good_length: '#27AE60',
  short:       '#4B7BEC',
}

const lengthToFilter: Record<LengthType, FilterType> = {
  yorker:      'YORKER',
  full:        'FULL',
  good_length: 'GOOD LENGTH',
  short:       'SHORT',
}

function toMapX(px: number, py: number) {
  const width = 40 + py * 10
  return 50 + (px - 0.5) * width
}
function toMapY(py: number) { return 10 + py * 110 }

const deliveryColors: Record<FilterType, string> = {
  ALL:           '#fff',
  YORKER:        '#E8413E',
  FULL:          '#F0A500',
  'GOOD LENGTH': '#27AE60',
  SHORT:         '#4B7BEC',
}

const filters: FilterType[] = ['ALL', 'YORKER', 'FULL', 'GOOD LENGTH', 'SHORT']

const statTypes: Array<{ type: FilterType; lt: LengthType; color: string }> = [
  { type: 'YORKER',       lt: 'yorker',      color: '#E8413E' },
  { type: 'FULL',         lt: 'full',         color: '#F0A500' },
  { type: 'GOOD LENGTH',  lt: 'good_length',  color: '#27AE60' },
  { type: 'SHORT',        lt: 'short',        color: '#4B7BEC' },
]

export default function PitchMapPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL')
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.from('deliveries').select('*').eq('session_id', sessionId).order('delivery_number', { ascending: true })
      .then(({ data, error: err }: { data: Delivery[] | null; error: { message: string } | null }) => {
        if (err) { setError(err.message); return }
        setDeliveries((data ?? []) as Delivery[])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E8413E] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center gap-4 px-8">
      <p className="text-[#E8413E] text-center">{error}</p>
      <button onClick={() => router.back()} className="text-white text-sm underline">Go back</button>
    </div>
  )

  const total = deliveries.length
  const pitchDots = deliveries.map(d => ({
    x: toMapX(d.pitch_x, d.pitch_y),
    y: toMapY(d.pitch_y),
    type: lengthToFilter[d.length_type],
    color: lengthColor[d.length_type] ?? '#888',
  }))

  const filteredDots = activeFilter === 'ALL' ? pitchDots : pitchDots.filter(d => d.type === activeFilter)

  const stats = statTypes.map(({ type, lt, color }) => {
    const count = deliveries.filter(d => d.length_type === lt).length
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0
    return { type, color, count, percentage }
  })

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-[390px] h-[844px] bg-[#141414] flex flex-col overflow-hidden">
        <div className="px-6 pt-16 pb-6 flex items-center justify-between flex-shrink-0">
          <button onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-[#1e1e1e] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2} />
          </button>
          <h2 className="text-xl font-bold text-white">Pitch Map</h2>
          <button className="w-10 h-10 rounded-full bg-[#1e1e1e] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors">
            <SlidersHorizontal className="w-5 h-5 text-white" strokeWidth={2} />
          </button>
        </div>

        <div className="px-6 mb-4 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {filters.map(filter => (
              <button key={filter} onClick={() => setActiveFilter(filter)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold tracking-wide uppercase transition-all ${activeFilter === filter ? 'bg-white text-[#141414]' : 'bg-transparent border-2 border-white text-white hover:bg-white/10'}`}>
                <div className="flex items-center gap-2">
                  {filter !== 'ALL' && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: deliveryColors[filter] }} />
                  )}
                  {filter}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
          <div className="relative bg-[#1e1e1e] rounded-2xl p-6 mb-6" style={{ height: '320px' }}>
            <svg viewBox="0 0 100 130" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}>
              <defs>
                <filter id="glowDot">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <path d="M 30 10 L 70 10 L 75 120 L 25 120 Z" fill="#252525" stroke="#333" strokeWidth="0.5" />
              <line x1="30" y1="36" x2="70" y2="36" stroke="#333" strokeWidth="0.3" opacity="0.25" />
              <line x1="28" y1="62" x2="72" y2="62" stroke="#333" strokeWidth="0.3" opacity="0.25" />
              <line x1="27" y1="88" x2="73" y2="88" stroke="#333" strokeWidth="0.3" opacity="0.25" />
              <line x1="40" y1="10" x2="37" y2="120" stroke="#333" strokeWidth="0.3" opacity="0.25" />
              <line x1="50" y1="10" x2="50" y2="120" stroke="#333" strokeWidth="0.3" opacity="0.25" />
              <line x1="60" y1="10" x2="63" y2="120" stroke="#333" strokeWidth="0.3" opacity="0.25" />
              <line x1="30" y1="10" x2="70" y2="10" stroke="white" strokeWidth="1" opacity="0.6" />
              <line x1="25" y1="120" x2="75" y2="120" stroke="white" strokeWidth="1.2" opacity="0.8" />
              <g transform="translate(50, 118)">
                <rect x="-4" y="-6" width="1.5" height="6" fill="white" opacity="0.9" />
                <rect x="-1" y="-6" width="1.5" height="6" fill="white" opacity="0.9" />
                <rect x="2"  y="-6" width="1.5" height="6" fill="white" opacity="0.9" />
                <rect x="-4.5" y="-7" width="9" height="0.8" fill="white" opacity="0.9" rx="0.4" />
              </g>
              {filteredDots.map((dot, index) => (
                <g key={index}>
                  <circle cx={dot.x} cy={dot.y} r="3" fill={dot.color} opacity="0.15" />
                  <circle cx={dot.x} cy={dot.y} r="2" fill={dot.color} opacity="0.3" />
                  <circle cx={dot.x} cy={dot.y} r="1.2" fill={dot.color} filter="url(#glowDot)" />
                </g>
              ))}
            </svg>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {stats.map((stat, index) => (
              <div key={index} className="bg-[#1e1e1e] rounded-xl p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stat.color, boxShadow: `0 0 8px ${stat.color}40` }} />
                  <span className="text-white text-xs font-bold uppercase tracking-wide">{stat.type}</span>
                </div>
                <div className="text-3xl font-black text-white mb-1">{stat.count}</div>
                <div className="relative h-1.5 bg-[#141414] rounded-full overflow-hidden mb-1">
                  <div className="absolute top-0 left-0 h-full rounded-full" style={{ backgroundColor: stat.color, width: `${stat.percentage}%` }} />
                </div>
                <div className="text-xs text-[#888] font-bold">{stat.percentage}%</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center py-4">
            <p className="text-[#888] text-xs font-medium">Pinch to zoom</p>
          </div>
        </div>
      </div>
    </div>
  )
}
