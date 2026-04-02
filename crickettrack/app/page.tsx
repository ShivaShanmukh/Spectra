'use client'

import { PitchMap } from '@/components/PitchMap'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col items-center justify-between px-6 pt-20 pb-8">
        <div className="text-center">
          <h1 className="text-white text-4xl font-black mb-2">CricketTrack</h1>
          <p className="text-[#888] text-sm font-medium">AI-Powered Bowling Analytics</p>
        </div>

        <div className="flex-1 flex items-center justify-center w-full py-8">
          <PitchMap />
        </div>

        <div className="w-full">
          <h2 className="text-white text-2xl font-black mb-3 text-center">Perfect Your Bowling</h2>
          <p className="text-[#888] text-center text-sm mb-8 leading-relaxed">
            Track every delivery. Analyze your line, length, and speed.
            Improve with data-driven insights.
          </p>
          <button
            onClick={() => router.push('/signup')}
            className="w-full bg-[#E8413E] text-white py-4 rounded-full font-bold text-base hover:bg-[#f04945] transition-all flex items-center justify-center gap-2"
          >
            Get Started
            <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <button
            onClick={() => router.push('/login')}
            className="w-full text-[#888] text-sm mt-4 hover:text-white transition-colors"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
