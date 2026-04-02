'use client'

import { ArrowLeft, Share2, Flame, Play, Zap, Target, TrendingUp, Award, ChevronDown, ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import type { Analytics, Session, Delivery, LengthType } from '@/lib/types'

const lengthColor: Record<LengthType, string> = {
  yorker: '#27AE60', full: '#4B7BEC', good_length: '#F0A500', short: '#E8413E',
}
function toSvgX(px: number) { return 10 + px * 80 }
function toSvgY(py: number) { return 5 + py * 90 }

export default function ResultsPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params
  const router = useRouter()
  const [selectedSpeed, setSelectedSpeed] = useState('1x')
  const [isPitchMapExpanded, setIsPitchMapExpanded] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const speedOptions = ['0.5x', '1x', '2x']

  useEffect(() => {
    const sb = getBrowserClient()
    Promise.all([
      sb.from('sessions').select('*').eq('id', sessionId).single(),
      sb.from('analytics').select('*').eq('session_id', sessionId).single(),
      sb.from('deliveries').select('*').eq('session_id', sessionId).order('delivery_number', { ascending: true }),
    ]).then(([{ data: s }, { data: a }, { data: d }]) => {
      if (!s || !a) { setError('Results not found'); return }
      setSession(s as Session)
      setAnalytics(a as Analytics)
      setDeliveries((d ?? []) as Delivery[])
    }).catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E8413E] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !analytics || !session) return (
    <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center gap-4 px-8">
      <p className="text-[#E8413E] text-center">{error || 'Results not found'}</p>
      <button onClick={() => router.push('/dashboard')} className="text-white text-sm underline">Back to dashboard</button>
    </div>
  )

  const topLengthEntry = Object.entries(analytics.length_distribution).sort(([, a], [, b]) => b - a)[0]
  const topLengthLabel = topLengthEntry ? topLengthEntry[0].replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'
  const topLengthPct = topLengthEntry ? Math.round(topLengthEntry[1] * 100) : 0
  const yorkerCount = deliveries.filter(d => d.length_type === 'yorker').length
  const bowlerInitial = session.bowler_name?.[0]?.toUpperCase() ?? '?'
  const pitchDots = deliveries.map(d => ({ x: toSvgX(d.pitch_x), y: toSvgY(d.pitch_y), color: lengthColor[d.length_type] ?? '#888' }))

  const categoryCards = [
    { color: '#E8413E', title: 'Speed',   icon: Zap,       value: `${Math.round(analytics.avg_speed)} km/h`, subtext: 'avg' },
    { color: '#4B7BEC', title: 'Line',    icon: Target,    value: `${Math.round(analytics.line_consistency_pct)}%`, subtext: 'accuracy' },
    { color: '#F0A500', title: 'Length',  icon: TrendingUp, value: `${topLengthPct}%`, subtext: topLengthLabel },
    { color: '#27AE60', title: 'Yorkers', icon: Award,     value: `${yorkerCount}`, subtext: 'bowled' },
  ]

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col overflow-hidden">
        <div className="px-6 pt-16 pb-4 flex items-center justify-between flex-shrink-0">
          <button onClick={() => router.push('/dashboard')} className="text-white hover:text-[#E8413E] transition-colors">
            <ArrowLeft className="w-6 h-6" strokeWidth={2} />
          </button>
          <h2 className="text-xl font-bold text-white">Session Results</h2>
          <button className="text-white hover:text-[#E8413E] transition-colors"><Share2 className="w-6 h-6" strokeWidth={2} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E8413E] to-[#4B7BEC] flex items-center justify-center">
              <span className="text-white text-sm font-black">{bowlerInitial}</span>
            </div>
            <span className="text-white font-black text-base tracking-wide">{session.bowler_name.toUpperCase()}</span>
            <div className="bg-[#E8413E] px-2.5 py-1 rounded-full"><span className="text-white text-[10px] font-black tracking-wide">BOWLER</span></div>
            <Flame className="w-4 h-4 text-[#F0A500]" fill="#F0A500" />
          </div>

          {/* Video card */}
          <div className="bg-[#1e1e1e] rounded-2xl overflow-hidden mb-6 relative">
            <div className="relative aspect-video">
              <ImageWithFallback src="https://images.unsplash.com/photo-1596807996038-612df413be5e?w=600&q=80" alt="Cricket bowling" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/30" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 50 Q 30 40, 50 45 T 90 55" stroke="#E8413E" strokeWidth="0.5" fill="none" opacity="0.6" />
                {[10,25,40,55,70,85].map((cx,i) => <circle key={i} cx={cx} cy={45+i*1.5} r={1.2+i*0.2} fill={i>2?"#E8413E":"white"} opacity={0.8} />)}
              </svg>
              <button className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-[#E8413E] flex items-center justify-center hover:bg-[#f04945] transition-all hover:scale-110">
                  <Play className="w-7 h-7 text-white ml-1" fill="white" />
                </div>
              </button>
            </div>
            <div className="absolute bottom-4 left-4 flex gap-2">
              {speedOptions.map(s => (
                <button key={s} onClick={() => setSelectedSpeed(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedSpeed === s ? 'bg-white text-[#141414]' : 'bg-black/50 text-white hover:bg-black/70'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Giant stat */}
          <div className="relative mb-6 flex items-center justify-between">
            <div>
              <div className="text-[72px] font-black text-white leading-none">{analytics.total_deliveries}</div>
              <div className="text-sm text-[#888] font-bold tracking-wider uppercase">Deliveries Analysed</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-white font-black text-lg">{Math.round(analytics.line_consistency_pct)}%</div>
                <div className="text-[#888] text-xs font-bold tracking-wide uppercase">Line</div>
              </div>
              <div className="relative h-32 w-10">
                <div className="absolute inset-0 bg-[#1e1e1e] rounded-full overflow-hidden">
                  <div className="absolute bottom-0 left-0 right-0 rounded-full"
                    style={{ height: `${analytics.line_consistency_pct}%`, background: 'linear-gradient(to top, #4B7BEC 0%, #E8413E 100%)' }} />
                </div>
                <div className="absolute -right-6 top-0 text-[10px] text-[#888] font-bold">100</div>
                <div className="absolute -right-6 bottom-0 text-[10px] text-[#888] font-bold">0</div>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar mb-6">
            {categoryCards.map((card, i) => (
              <div key={i} className="flex-shrink-0 w-[160px] h-[140px] rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden" style={{ backgroundColor: card.color }}>
                <div className="absolute top-2 right-2 w-20 h-20 rounded-full border-4 border-white opacity-10" />
                <card.icon className="w-7 h-7 text-white relative z-10" strokeWidth={2.5} />
                <div className="relative z-10">
                  <div className="text-3xl font-black text-white mb-0.5">{card.value}</div>
                  <div className="text-[10px] text-white/80 font-bold tracking-wide uppercase mb-1">{card.subtext}</div>
                  <div className="text-xs text-white/90 font-bold uppercase">{card.title}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="bg-[#1e1e1e] rounded-xl mb-6 overflow-hidden relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E8413E]" />
            <div className="pl-6 pr-5 py-4 flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div>
                <h4 className="text-white font-bold text-base mb-1">Performance Insight</h4>
                <p className="text-[#888] text-sm leading-relaxed">{analytics.summary_text ?? 'Great effort! Keep working on your line and length consistency.'}</p>
              </div>
            </div>
          </div>

          {/* Pitch map collapsible */}
          <div className="mb-6">
            <button onClick={() => setIsPitchMapExpanded(!isPitchMapExpanded)}
              className="w-full bg-[#1e1e1e] rounded-xl p-4 flex items-center justify-between hover:bg-[#2a2a2a] transition-colors mb-3">
              <h3 className="text-white font-bold text-base">Pitch Map</h3>
              <ChevronDown className={`w-5 h-5 text-white transition-transform ${isPitchMapExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isPitchMapExpanded && (
              <div className="bg-[#1e1e1e] rounded-xl p-6">
                <svg viewBox="0 0 100 100" className="w-full h-auto">
                  <rect x="10" y="5" width="80" height="90" fill="#141414" rx="2" />
                  <rect x="10" y="5" width="80" height="90" fill="none" stroke="#333" strokeWidth="0.5" />
                  <line x1="10" y1="20" x2="90" y2="20" stroke="#666" strokeWidth="0.5" />
                  <line x1="10" y1="80" x2="90" y2="80" stroke="#666" strokeWidth="0.5" />
                  <rect x="48" y="18" width="4" height="4" fill="#888" />
                  <rect x="48" y="78" width="4" height="4" fill="#888" />
                  <rect x="10" y="30" width="80" height="25" fill="#F0A500" opacity="0.1" />
                  <text x="50" y="45" textAnchor="middle" fill="#888" fontSize="3" opacity="0.5">GOOD LENGTH</text>
                  {pitchDots.map((dot, i) => (
                    <g key={i}><circle cx={dot.x} cy={dot.y} r="3" fill={dot.color} opacity="0.2" /><circle cx={dot.x} cy={dot.y} r="1.5" fill={dot.color} /></g>
                  ))}
                </svg>
                <div className="flex items-center justify-center gap-4 mt-4">
                  {[['#E8413E','Short'],['#F0A500','Good Length'],['#4B7BEC','Full'],['#27AE60','Yorker']].map(([c,l]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                      <span className="text-xs text-[#888]">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => router.push(`/results/${sessionId}/pitch-map`)}
            className="w-full bg-transparent border-2 border-[#E8413E] text-[#E8413E] py-4 rounded-xl font-bold text-base hover:bg-[#E8413E] hover:text-white transition-all flex items-center justify-center gap-2">
            View All Deliveries
            <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
