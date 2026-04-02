'use client'

import { ArrowLeft, Share2, Play, Pause, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import type { Delivery, LengthType, LineType } from '@/lib/types'

const lengthLabel: Record<LengthType, string> = {
  yorker:      'Yorker',
  full:        'Full',
  good_length: 'Good Length',
  short:       'Short',
}

const lengthColor: Record<LengthType, string> = {
  yorker:      '#27AE60',
  full:        '#4B7BEC',
  good_length: '#E8413E',
  short:       '#F0A500',
}

function toMiniX(px: number) { return 20 + px * 60 }
function toMiniY(py: number) { return 10 + py * 140 }

export default function DeliveryDetailPage({ params }: { params: { sessionId: string; deliveryId: string } }) {
  const { sessionId, deliveryId } = params
  const router = useRouter()
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState('0.5x')
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = getBrowserClient()
    Promise.all([
      supabase.from('deliveries').select('*').eq('id', deliveryId).single(),
      supabase.from('deliveries').select('*').eq('session_id', sessionId).order('delivery_number', { ascending: true }),
    ]).then(([{ data: d, error: e1 }, { data: all, error: e2 }]) => {
      if (e1 || e2 || !d) { setError((e1 || e2)?.message ?? 'Delivery not found'); return }
      setDelivery(d as Delivery)
      setAllDeliveries((all ?? []) as Delivery[])
    }).catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId, deliveryId])

  if (loading) return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#E8413E] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !delivery) return (
    <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center gap-4 px-8">
      <p className="text-[#E8413E] text-center">{error || 'Delivery not found'}</p>
      <button onClick={() => router.back()} className="text-white text-sm underline">Go back</button>
    </div>
  )

  const currentIdx = allDeliveries.findIndex(d => d.id === delivery.id)
  const prevDelivery = currentIdx > 0 ? allDeliveries[currentIdx - 1] : null
  const nextDelivery = currentIdx < allDeliveries.length - 1 ? allDeliveries[currentIdx + 1] : null

  const dotColor = lengthColor[delivery.length_type] ?? '#E8413E'
  const currentX = toMiniX(delivery.pitch_x)
  const currentY = toMiniY(delivery.pitch_y)
  const onLine = delivery.line_type === ('on_line' as LineType)

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col overflow-hidden">
        <div className="px-6 pt-16 pb-4 flex items-center justify-between flex-shrink-0">
          <button onClick={() => router.push(`/results/${sessionId}/pitch-map`)}
            className="flex items-center gap-1 text-white hover:text-[#E8413E] transition-colors">
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            <span className="font-bold text-sm">Deliveries</span>
          </button>
          <h2 className="text-xl font-bold text-white">Delivery #{delivery.delivery_number}</h2>
          <button className="text-white hover:text-[#E8413E] transition-colors">
            <Share2 className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
          {/* Video Player */}
          <div className="bg-[#1e1e1e] rounded-2xl overflow-hidden mb-6 relative">
            <div className="relative aspect-video">
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1596807996038-612df413be5e?w=600&q=80"
                alt="Cricket delivery"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <filter id="glowBall">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <path d="M 15 45 Q 35 38, 55 42 T 88 50" stroke={dotColor} strokeWidth="0.8" fill="none" opacity="0.8" filter="url(#glowBall)" />
                <circle cx="15" cy="45" r="1.2" fill={dotColor} opacity="0.6" />
                <circle cx="28" cy="40" r="1.4" fill={dotColor} opacity="0.7" />
                <circle cx="42" cy="40" r="1.6" fill={dotColor} opacity="0.8" />
                <circle cx="56" cy="42" r="1.8" fill={dotColor} />
                <circle cx="70" cy="46" r="2"   fill={dotColor} filter="url(#glowBall)" />
                <circle cx="82" cy="49" r="1.6" fill={dotColor} opacity="0.9" />
              </svg>
              <button onClick={() => setIsPlaying(!isPlaying)} className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-[#E8413E] flex items-center justify-center hover:bg-[#f04945] transition-all hover:scale-110">
                  {isPlaying
                    ? <Pause className="w-7 h-7 text-white" strokeWidth={2} fill="white" />
                    : <Play className="w-7 h-7 text-white ml-1" strokeWidth={2} fill="white" />}
                </div>
              </button>
            </div>
            <div className="p-4">
              <div className="relative h-1 bg-[#141414] rounded-full mb-3 overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-[#E8413E] rounded-full w-[45%]" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-[#E8413E] transition-colors">
                    {isPlaying
                      ? <Pause className="w-5 h-5" strokeWidth={2} />
                      : <Play className="w-5 h-5" strokeWidth={2} />}
                  </button>
                  <span className="text-xs text-[#888] font-medium">0:03 / 0:08</span>
                </div>
                <button onClick={() => setPlaybackSpeed(playbackSpeed === '0.5x' ? '1x' : '0.5x')}
                  className="px-3 py-1.5 rounded-full bg-[#141414] text-white text-xs font-bold hover:bg-[#E8413E] transition-all">
                  {playbackSpeed}
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Type Badge */}
          <div className="flex flex-col items-center mb-6">
            <div className="px-6 py-3 rounded-full mb-2" style={{ backgroundColor: dotColor }}>
              <span className="text-white font-black text-base tracking-wider uppercase">{lengthLabel[delivery.length_type]}</span>
            </div>
            <p className="text-[#888] text-sm font-medium">Delivery {delivery.delivery_number} of {allDeliveries.length}</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[#1e1e1e] rounded-xl p-4 flex flex-col items-center">
              <div className="text-4xl font-black text-white mb-1">{Math.round(delivery.speed_estimate)}</div>
              <div className="text-[10px] text-[#888] font-bold tracking-wider uppercase">KM/H</div>
            </div>
            <div className="bg-[#1e1e1e] rounded-xl p-4 flex flex-col items-center">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm font-black text-white">{onLine ? 'ON LINE' : 'OFF LINE'}</span>
                {onLine
                  ? <Check className="w-4 h-4 text-[#27AE60]" strokeWidth={3} />
                  : <X className="w-4 h-4 text-[#E8413E]" strokeWidth={3} />}
              </div>
              <div className="text-[10px] text-[#888] font-bold tracking-wider uppercase">Accuracy</div>
            </div>
            <div className="bg-[#1e1e1e] rounded-xl p-4 flex flex-col items-center">
              <div className="text-4xl font-black text-white mb-1">{(delivery.pitch_y * 10).toFixed(1)}</div>
              <div className="text-[10px] text-[#888] font-bold tracking-wider uppercase text-center">Pitch Zone</div>
            </div>
          </div>

          {/* Mini Pitch Map */}
          <div className="bg-[#1e1e1e] rounded-xl p-5 mb-6">
            <h3 className="text-[10px] text-[#888] font-bold tracking-wider uppercase text-center mb-3">Landing Zone</h3>
            <div className="flex justify-center">
              <svg viewBox="0 0 100 160" className="w-[120px] h-[200px]">
                <rect x="20" y="10" width="60" height="140" fill="#141414" stroke="#333" strokeWidth="0.5" />
                <line x1="20" y1="25"  x2="80" y2="25"  stroke="#666" strokeWidth="0.5" />
                <line x1="20" y1="135" x2="80" y2="135" stroke="#666" strokeWidth="0.5" />
                <rect x="20" y="60" width="60" height="40" fill="#E8413E" opacity="0.08" />
                <rect x="48" y="133" width="4" height="4" fill="#888" />
                {allDeliveries.map(d => {
                  if (d.id === delivery.id) return null
                  return (
                    <circle key={d.id} cx={toMiniX(d.pitch_x)} cy={toMiniY(d.pitch_y)} r="1.5" fill="white" opacity="0.2" />
                  )
                })}
                <circle cx={currentX} cy={currentY} r="6"   fill={dotColor} opacity="0.15" />
                <circle cx={currentX} cy={currentY} r="4"   fill={dotColor} opacity="0.3"  />
                <circle cx={currentX} cy={currentY} r="2.5" fill={dotColor} />
              </svg>
            </div>
          </div>

          {/* Prev / Next Navigation */}
          <div className="grid grid-cols-2 gap-3">
            <button disabled={!prevDelivery}
              onClick={() => prevDelivery && router.push(`/results/${sessionId}/delivery/${prevDelivery.id}`)}
              className="bg-transparent border-2 border-[#1e1e1e] text-white py-4 rounded-xl font-bold text-base hover:border-[#E8413E] hover:text-[#E8413E] transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
              Prev
            </button>
            <button disabled={!nextDelivery}
              onClick={() => nextDelivery && router.push(`/results/${sessionId}/delivery/${nextDelivery.id}`)}
              className="bg-[#E8413E] border-2 border-[#E8413E] text-white py-4 rounded-xl font-bold text-base hover:bg-[#f04945] transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">
              Next
              <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
