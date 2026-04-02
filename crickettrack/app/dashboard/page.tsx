'use client'

import { Bookmark, Bell, Flame, Plus, Target, Zap, TrendingUp, Upload, Activity, Brain, Shield, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/context/AuthContext'
import type { Session, Analytics } from '@/lib/types'

function buildDateStrip(sessions: Session[]) {
  const sessionDates = new Set(sessions.map(s => new Date(s.created_at).toDateString()))
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 5 + i)
    return { day: d.getDate(), label: days[d.getDay()], hasSession: sessionDates.has(d.toDateString()), isToday: i === 5 }
  })
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('SESSIONS')
  const [sessions, setSessions] = useState<Session[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeDate, setActiveDate] = useState<number | null>(null)
  const tabs = ['SESSIONS', 'STATS', 'HISTORY', 'BEST']

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.from('sessions').select('*').order('created_at', { ascending: false })
      .then(async ({ data }: { data: Session[] | null }) => {
        const all = (data ?? []) as Session[]
        setSessions(all)
        const latest = all.find(s => s.status === 'complete')
        if (latest) {
          const { data: a } = await supabase.from('analytics').select('*').eq('session_id', latest.id).single()
          if (a) setAnalytics(a as Analytics)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const dateStrip = buildDateStrip(sessions)
  const latestCompleteSession = sessions.find(s => s.status === 'complete')
  const lineConsistency = analytics?.line_consistency_pct ?? 0
  const avgSpeed = analytics ? `${Math.round(analytics.avg_speed)} km/h` : '— km/h'
  const accuracy = analytics ? `${Math.round(analytics.line_consistency_pct)}%` : '—%'
  const userInitial = user?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'

  const categoryCards = [
    { color: '#E8413E', title: 'Accuracy', icon: Target, value: accuracy },
    { color: '#4B7BEC', title: 'Speed', icon: Zap, value: avgSpeed },
    { color: '#F0A500', title: 'Sessions', icon: TrendingUp, value: `${sessions.length}` },
  ]

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="px-6 pt-16 pb-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E8413E] to-[#4B7BEC] flex items-center justify-center">
              <span className="text-white text-sm font-black">{userInitial}</span>
            </div>
            <div className="bg-[#E8413E] px-3 py-1 rounded-full">
              <span className="text-white text-xs font-black tracking-wide">BOWLER LVL {Math.max(1, Math.floor(sessions.length / 5) + 1)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[#F0A500]" fill="#F0A500" />
              <span className="text-white text-sm font-bold">{sessions.length * 12} pts</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-[#1e1e1e] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors">
              <Bookmark className="w-4 h-4 text-white" strokeWidth={2} />
            </button>
            <button className="w-9 h-9 rounded-full bg-[#1e1e1e] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors relative">
              <Bell className="w-4 h-4 text-white" strokeWidth={2} />
              <div className="absolute top-1 right-1 w-2 h-2 bg-[#E8413E] rounded-full"></div>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 no-scrollbar">
          <h1 className="text-[52px] font-black text-white leading-none mb-6">Dashboard</h1>

          {/* Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-xs font-black tracking-wider whitespace-nowrap transition-all ${activeTab === tab ? 'bg-white text-[#141414]' : 'bg-transparent border-2 border-white text-white hover:bg-white/10'}`}>
                {tab}
              </button>
            ))}
          </div>

          {/* Date Strip */}
          <div className="flex gap-3 mb-8 overflow-x-auto pb-2 no-scrollbar">
            {dateStrip.map(date => (
              <button key={date.day} onClick={() => setActiveDate(date.day)}
                className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl transition-all flex-shrink-0 relative ${(activeDate ?? dateStrip[5].day) === date.day ? 'bg-[#1e1e1e]' : 'bg-transparent hover:bg-[#1e1e1e]/50'}`}>
                {date.hasSession && <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#E8413E] rounded-full" />}
                <span className="text-white text-base font-bold">{date.day}</span>
                <span className="text-[#888] text-xs font-medium">{date.label}</span>
              </button>
            ))}
          </div>

          {/* Hero */}
          <div className="relative mb-8 h-[400px]">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full bg-[#1e1e1e]"></div>
            <button onClick={() => router.push('/upload')}
              className="absolute left-8 top-12 w-12 h-12 rounded-full bg-[#E8413E] flex items-center justify-center hover:bg-[#f04945] transition-colors shadow-lg z-10">
              <Plus className="w-6 h-6 text-white" strokeWidth={3} />
            </button>
            <div className="absolute left-8 bottom-12 z-10">
              <div className="text-[72px] font-black text-white leading-none">{loading ? '—' : sessions.length}</div>
              <div className="text-sm text-[#888] font-bold tracking-wider mt-1">SESSIONS BOWLED</div>
            </div>
            <div className="absolute right-8 top-16 bottom-16 w-12 z-10">
              <div className="relative h-full bg-[#1e1e1e] rounded-full overflow-hidden">
                <div className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-700"
                  style={{ height: `${lineConsistency}%`, background: 'linear-gradient(to top, #4B7BEC 0%, #E8413E 100%)' }} />
              </div>
              <div className="absolute -right-8 top-0 text-xs text-[#888] font-bold">100</div>
              <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-xs text-white font-bold">50</div>
              <div className="absolute -right-8 bottom-0 text-xs text-[#888] font-bold">0</div>
              <div className="absolute -left-2 -bottom-8 text-[10px] text-[#888] font-bold tracking-wide whitespace-nowrap">LINE CONSISTENCY</div>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar mb-8">
            {categoryCards.map(card => (
              <div key={card.title} className="flex-shrink-0 w-[160px] h-[160px] rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden" style={{ backgroundColor: card.color }}>
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-4 right-4 w-20 h-20 rounded-full border-4 border-white"></div>
                </div>
                <card.icon className="w-8 h-8 text-white relative z-10" strokeWidth={2.5} />
                <div className="relative z-10">
                  <div className="text-3xl font-black text-white mb-1">{card.value}</div>
                  <div className="text-xs text-white/90 font-bold tracking-wide uppercase">{card.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Nav */}
        <div className="px-6 pb-8 pt-4 flex-shrink-0">
          <div className="bg-[#1e1e1e] rounded-full px-6 py-4 flex items-center justify-between">
            <button onClick={() => router.push('/dashboard')} className="text-white transition-colors">
              <Users className="w-6 h-6" strokeWidth={2} />
            </button>
            <button onClick={() => router.push('/upload')} className="w-12 h-12 rounded-full bg-[#E8413E] flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
            <button className="text-[#888] hover:text-white transition-colors">
              <Activity className="w-6 h-6" strokeWidth={2} />
            </button>
            <button onClick={() => latestCompleteSession && router.push(`/results/${latestCompleteSession.id}`)}
              className={`transition-colors ${latestCompleteSession ? 'text-[#888] hover:text-white' : 'text-[#444] cursor-not-allowed'}`}>
              <Brain className="w-6 h-6" strokeWidth={2} />
            </button>
            <button className="text-[#888] hover:text-white transition-colors">
              <Shield className="w-6 h-6" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
