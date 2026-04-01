'use client'

import { useState, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadStatus = 'idle' | 'validating' | 'uploading' | 'success' | 'error' | 'cancelled'

export type UploadResult = {
  sessionId: string
  videoUrl: string
  storagePath: string
  status: string
}

export type UploadError = {
  code: string
  message: string
}

export type UseUploadReturn = {
  upload: (file: File, bowlerName: string, notes?: string) => Promise<UploadResult | null>
  cancel: () => void
  progress: number           // 0–100
  status: UploadStatus
  isUploading: boolean
  error: UploadError | null
  sessionId: string | null
  reset: () => void
}

// ─── Duration validation helper ───────────────────────────────────────────────

const MIN_DURATION_SECONDS = 300 // 5 minutes

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(video.duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read video metadata'))
    }
    video.src = url
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUpload(): UseUploadReturn {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<UploadError | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setProgress(0)
    setStatus('idle')
    setError(null)
    setSessionId(null)
    abortControllerRef.current = null
  }, [])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setStatus('cancelled')
    setProgress(0)
  }, [])

  const upload = useCallback(
    async (
      file: File,
      bowlerName: string,
      notes?: string
    ): Promise<UploadResult | null> => {
      reset()

      // ── 1. Client-side validation ──────────────────────────────────────────

      setStatus('validating')

      const ext = file.name.split('.').pop()?.toLowerCase()
      if (file.type !== 'video/mp4' && file.type !== 'video/quicktime') {
        const uploadError: UploadError = {
          code: 'INVALID_FILE_TYPE',
          message: 'Only MP4 and MOV files are accepted.',
        }
        setError(uploadError)
        setStatus('error')
        return null
      }

      if (!ext || (ext !== 'mp4' && ext !== 'mov')) {
        const uploadError: UploadError = {
          code: 'INVALID_FILE_TYPE',
          message: 'File extension must be .mp4 or .mov.',
        }
        setError(uploadError)
        setStatus('error')
        return null
      }

      const MAX_BYTES = 500 * 1024 * 1024
      if (file.size > MAX_BYTES) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(0)
        const uploadError: UploadError = {
          code: 'FILE_TOO_LARGE',
          message: `File is ${sizeMB} MB. Maximum is 500 MB.`,
        }
        setError(uploadError)
        setStatus('error')
        return null
      }

      // Check duration via HTML5 video element
      let durationSeconds: number
      try {
        durationSeconds = await getVideoDuration(file)
      } catch {
        const uploadError: UploadError = {
          code: 'DURATION_READ_ERROR',
          message: 'Could not read video duration. Make sure the file is a valid video.',
        }
        setError(uploadError)
        setStatus('error')
        return null
      }

      if (durationSeconds < MIN_DURATION_SECONDS) {
        const mins = (durationSeconds / 60).toFixed(1)
        const uploadError: UploadError = {
          code: 'VIDEO_TOO_SHORT',
          message: `Video is ${mins} min. Minimum required is 5 minutes.`,
        }
        setError(uploadError)
        setStatus('error')
        return null
      }

      // ── 2. Build form data ─────────────────────────────────────────────────

      const formData = new FormData()
      formData.append('video', file)
      formData.append('bowler_name', bowlerName.trim())
      formData.append('duration_seconds', String(Math.floor(durationSeconds)))
      if (notes?.trim()) {
        formData.append('notes', notes.trim())
      }

      // ── 3. Upload with progress tracking via XHR ───────────────────────────
      // fetch() does not expose upload progress — XHR does.

      setStatus('uploading')
      setProgress(0)

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      return new Promise<UploadResult | null>((resolve) => {
        const xhr = new XMLHttpRequest()

        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100)
            setProgress(pct)
          }
        })

        // Handle abort
        abortController.signal.addEventListener('abort', () => {
          xhr.abort()
        })

        xhr.onload = () => {
          abortControllerRef.current = null

          if (xhr.status >= 200 && xhr.status < 300) {
            let result: UploadResult
            try {
              result = JSON.parse(xhr.responseText)
            } catch {
              setError({ code: 'PARSE_ERROR', message: 'Invalid response from server.' })
              setStatus('error')
              resolve(null)
              return
            }
            setSessionId(result.sessionId)
            setProgress(100)
            setStatus('success')
            resolve(result)
          } else {
            let apiError: UploadError = {
              code: 'UPLOAD_FAILED',
              message: 'Upload failed. Please try again.',
            }
            try {
              apiError = JSON.parse(xhr.responseText)
            } catch {
              // keep default error
            }
            setError(apiError)
            setStatus('error')
            resolve(null)
          }
        }

        xhr.onerror = () => {
          abortControllerRef.current = null
          setError({ code: 'NETWORK_ERROR', message: 'Network error. Check your connection.' })
          setStatus('error')
          resolve(null)
        }

        xhr.onabort = () => {
          abortControllerRef.current = null
          setStatus('cancelled')
          setProgress(0)
          resolve(null)
        }

        xhr.open('POST', '/api/sessions/upload')
        xhr.send(formData)
      })
    },
    [reset]
  )

  return {
    upload,
    cancel,
    progress,
    status,
    isUploading: status === 'uploading' || status === 'validating',
    error,
    sessionId,
    reset,
  }
}
