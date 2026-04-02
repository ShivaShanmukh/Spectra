'use client'

import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export default function SignUpPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signUp(email, password, fullName)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="w-[390px] min-h-[844px] bg-[#141414] flex flex-col px-6 pt-16 pb-8">
        <button onClick={() => router.push('/')} className="self-start mb-8 text-white hover:text-[#E8413E] transition-colors">
          <ArrowLeft className="w-6 h-6" strokeWidth={2} />
        </button>

        <h1 className="text-white text-4xl font-black mb-2">Create Account</h1>
        <p className="text-[#888] text-sm mb-8">Join CricketTrack and start analyzing your bowling</p>

        <form onSubmit={handleSignUp} className="flex-1 flex flex-col">
          <div className="mb-4">
            <label className="text-white text-sm font-bold mb-2 block">Full Name</label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="John Doe" required
              className="w-full bg-[#1e1e1e] text-white placeholder:text-[#888] px-4 py-4 rounded-xl text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#E8413E]"
            />
          </div>

          <div className="mb-4">
            <label className="text-white text-sm font-bold mb-2 block">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="w-full bg-[#1e1e1e] text-white placeholder:text-[#888] px-4 py-4 rounded-xl text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#E8413E]"
            />
          </div>

          <div className="mb-6">
            <label className="text-white text-sm font-bold mb-2 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                className="w-full bg-[#1e1e1e] text-white placeholder:text-[#888] px-4 py-4 rounded-xl text-base font-medium focus:outline-none focus:ring-2 focus:ring-[#E8413E] pr-12"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#888] hover:text-white transition-colors">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && <p className="text-[#E8413E] text-sm mb-4 text-center">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-[#E8413E] text-white py-4 rounded-full font-bold text-base hover:bg-[#f04945] transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-center text-[#888] text-sm">
            Already have an account?{' '}
            <button type="button" onClick={() => router.push('/login')}
              className="text-[#E8413E] font-bold hover:underline">
              Sign In
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
