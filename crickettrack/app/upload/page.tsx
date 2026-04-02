'use client'

import { ArrowLeft, Video, Camera, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUpload } from '@/hooks/useUpload'

export default function UploadPage() {
  const router = useRouter()
  const { upload, progress, isUploading, error: uploadError } = useUpload()
  const [sessionName, setSessionName] = useState('')
  const [bowlerType, setBowlerType] = useState('fast')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const canSubmit = videoFile && sessionName.trim().length > 0 && !isUploading

  const handleUpload = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!videoFile || !sessionName.trim()) return
    setError('')
    const result = await upload(videoFile, sessionName.trim())
    if (result) {
      fetch('/api/jobs/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: result.sessionId }),
      }).catch(() => {})
      router.push(`/processing?sessionId=${result.sessionId}`)
    } else if (uploadError) {
      setError(uploadError.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center">
      <div className="phone-frame bg-[#141414] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-16 pb-6 flex items-center justify-between flex-shrink-0">
          <button onClick={() => router.push('/dashboard')}
            className="w-10 h-10 rounded-full bg-[#1e1e1e] flex items-center justify-center text-white hover:bg-[#2a2a2a] transition-colors">
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <h2 className="text-xl font-bold text-white">New Session</h2>
          <div className="w-10"></div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
          {/* Upload Zone */}
          <div className="bg-[#1e1e1e] rounded-2xl border-2 border-dashed border-[#E8413E] p-8 flex flex-col items-center justify-center mb-6 min-h-[240px]">
            <div className="w-12 h-12 rounded-full bg-[#E8413E]/10 flex items-center justify-center mb-4">
              <Video className="w-7 h-7 text-[#E8413E]" strokeWidth={2} />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">
              {isUploading ? `Uploading… ${progress}%` : videoFile ? 'Video Selected' : 'Upload Bowling Video'}
            </h3>
            <p className="text-[#888] text-sm text-center mb-4">
              {videoFile ? videoFile.name : 'MP4 or MOV · Max 500MB · 5–20 mins'}
            </p>
            {isUploading && (
              <div className="w-full bg-[#333] rounded-full h-2 mb-4">
                <div className="bg-[#E8413E] h-2 rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            )}
            {!isUploading && (
              <button onClick={() => document.getElementById('video-upload')?.click()}
                className="bg-[#E8413E] text-white px-5 py-2 rounded-full text-sm font-bold hover:bg-[#f04945] transition-colors">
                + {videoFile ? 'Change File' : 'Choose File'}
              </button>
            )}
            <input type="file" id="video-upload" accept="video/mp4,video/mov"
              onChange={e => setVideoFile(e.target.files?.[0] || null)} className="hidden" />
          </div>

          {/* Camera Tip */}
          <div className="bg-[#1e1e1e] rounded-xl mb-6 overflow-hidden relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E8413E]"></div>
            <div className="pl-6 pr-5 py-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#E8413E]/10 flex items-center justify-center flex-shrink-0">
                  <Camera className="w-4 h-4 text-[#E8413E]" strokeWidth={2} />
                </div>
                <h4 className="text-white font-bold text-base">Camera Setup</h4>
              </div>
              <p className="text-[#888] text-sm mb-4 leading-relaxed">Side-on angle, stump height, 5 metres back</p>
              <div className="bg-[#141414] rounded-lg p-4">
                <svg viewBox="0 0 300 120" className="w-full h-auto">
                  <rect x="80" y="40" width="140" height="60" fill="none" stroke="#888" strokeWidth="2" />
                  <line x1="110" y1="50" x2="110" y2="90" stroke="#888" strokeWidth="2" />
                  <line x1="190" y1="50" x2="190" y2="90" stroke="#888" strokeWidth="2" />
                  <circle cx="40" cy="70" r="12" fill="#E8413E" opacity="0.2" />
                  <rect x="34" y="66" width="12" height="8" fill="#E8413E" />
                  <circle cx="46" cy="70" r="3" fill="#E8413E" />
                  <line x1="52" y1="70" x2="78" y2="70" stroke="#888" strokeWidth="1" strokeDasharray="2,2" />
                  <text x="65" y="64" fill="#888" fontSize="10" textAnchor="middle">5m</text>
                  <text x="60" y="108" fill="#888" fontSize="10" textAnchor="middle">side-on</text>
                </svg>
              </div>
            </div>
          </div>

          {/* Session Details */}
          <div className="mb-4">
            <h3 className="text-[#888] text-xs uppercase tracking-widest font-bold">Session Details</h3>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs text-[#888] uppercase tracking-wider mb-2 font-medium">Session Name</label>
              <input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)}
                placeholder="Enter session name"
                className="w-full bg-[#1e1e1e] text-white px-4 py-4 rounded-xl border border-[#333] outline-none focus:border-[#E8413E] placeholder:text-[#888]" />
            </div>
            <div>
              <label className="block text-xs text-[#888] uppercase tracking-wider mb-2 font-medium">Bowler Type</label>
              <select value={bowlerType} onChange={e => setBowlerType(e.target.value)}
                className="w-full bg-[#1e1e1e] text-white px-4 py-4 rounded-xl border border-[#333] outline-none focus:border-[#E8413E]">
                <option value="fast">Fast</option>
                <option value="medium">Medium</option>
                <option value="slow">Slow</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Button */}
        <div className="px-6 pb-8 pt-4 flex-shrink-0">
          {(error || uploadError) && (
            <p className="text-[#E8413E] text-sm text-center mb-3">{error || uploadError?.message}</p>
          )}
          <button disabled={!canSubmit} onClick={handleUpload}
            className={`w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 ${canSubmit ? 'bg-[#E8413E] text-white hover:bg-[#f04945]' : 'bg-[#1e1e1e] text-[#666] cursor-not-allowed'}`}>
            {isUploading ? 'Uploading…' : 'Start Analysis'}
            {!isUploading && <ArrowRight className="w-5 h-5" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}
