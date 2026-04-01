import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'queued' | 'processing' | 'complete' | 'failed'
type SessionStatus = 'uploaded' | 'processing' | 'complete' | 'failed'

type ProcessingJob = {
  id: string
  session_id: string
  status: JobStatus
  attempts: number
  last_error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

type ProcessResponse = {
  jobId: string
  sessionId: string
  status: JobStatus
}

type PythonServicePayload = {
  session_id: string
  video_url: string
  bowler_name: string | null
}

type PythonServiceResponse = {
  session_id: string
  status: 'complete' | 'failed'
  error?: string | null
  processing_time_seconds: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL
const CRON_SECRET = process.env.CRON_SECRET

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setJobStatus(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string,
  status: JobStatus,
  extra?: { last_error?: string; completed_at?: string }
) {
  await supabase
    .from('processing_jobs')
    .update({ status, ...extra })
    .eq('id', jobId)
}

async function setSessionStatus(
  supabase: ReturnType<typeof createAdminClient>,
  sessionId: string,
  status: SessionStatus
) {
  await supabase
    .from('sessions')
    .update({ status })
    .eq('id', sessionId)
}

// ─── POST /api/jobs/process ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Parse body — sessionId present means instant mode (from frontend)
  const body = await request.json().catch(() => ({})) as { sessionId?: string }
  const { sessionId } = body
  const isInstantMode = Boolean(sessionId)

  // Cron mode requires CRON_SECRET; instant mode skips it (fire-and-forget from our own frontend)
  if (!isInstantMode) {
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!PYTHON_SERVICE_URL) {
    return NextResponse.json(
      { error: 'PYTHON_SERVICE_URL is not configured' },
      { status: 500 }
    )
  }

  const supabase = createAdminClient()

  let job: ProcessingJob | undefined

  if (isInstantMode) {
    // MODE B — instant: find the queued job for this specific session
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('session_id', sessionId!)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error || !data) {
      // Job not queued yet (trigger fired before DB trigger ran) — let cron handle it
      return NextResponse.json({ message: 'No queued job for session yet' }, { status: 204 })
    }

    // Claim it: mark as processing + increment attempts
    await supabase
      .from('processing_jobs')
      .update({ status: 'processing', attempts: data.attempts + 1, started_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('status', 'queued') // guard against double-claim

    job = { ...data, status: 'processing', attempts: data.attempts + 1 }
  } else {
    // MODE A — cron: atomically claim the next queued job (FOR UPDATE SKIP LOCKED in DB)
    const { data: jobs, error: claimError } = await supabase
      .rpc('claim_next_job')

    if (claimError) {
      console.error('[process] Failed to claim job:', claimError.message)
      return NextResponse.json({ error: claimError.message }, { status: 500 })
    }

    job = jobs?.[0] as ProcessingJob | undefined
  }

  // 3. No queued jobs — return 204 so the cron caller knows nothing to do
  if (!job) {
    return new NextResponse(null, { status: 204 })
  }

  console.log(`[process] Claimed job ${job.id} for session ${job.session_id} (attempt ${job.attempts})`)

  // 4. Mark session as processing
  await setSessionStatus(supabase, job.session_id, 'processing')

  // 5. Fetch the video URL (storage path) from the session row
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('video_url, bowler_name')
    .eq('id', job.session_id)
    .single()

  if (sessionError || !session) {
    const msg = sessionError?.message ?? 'Session not found'
    console.error(`[process] Could not fetch session ${job.session_id}:`, msg)
    await setJobStatus(supabase, job.id, 'failed', { last_error: msg })
    await setSessionStatus(supabase, job.session_id, 'failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // 6. Call the Python processing service
  let pythonResponse: PythonServiceResponse

  try {
    const payload: PythonServicePayload = {
      session_id: job.session_id,
      video_url: session.video_url,
      bowler_name: session.bowler_name ?? null,
    }

    const res = await fetch(`${PYTHON_SERVICE_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min timeout
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Python service returned ${res.status}: ${text}`)
    }

    pythonResponse = await res.json()

    if (pythonResponse.status !== 'complete') {
      throw new Error(pythonResponse.error ?? 'Python service returned status=failed')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error calling Python service'
    console.error(`[process] Python service failed for job ${job.id}:`, message)

    // 7a. Failure path — retry if under max attempts, otherwise mark failed
    if (job.attempts < MAX_ATTEMPTS) {
      console.log(`[process] Requeing job ${job.id} (attempt ${job.attempts}/${MAX_ATTEMPTS})`)
      await setJobStatus(supabase, job.id, 'queued', { last_error: message })
      await setSessionStatus(supabase, job.session_id, 'uploaded')
    } else {
      console.log(`[process] Job ${job.id} exceeded max attempts — marking failed`)
      await setJobStatus(supabase, job.id, 'failed', { last_error: message })
      await setSessionStatus(supabase, job.session_id, 'failed')
    }

    return NextResponse.json<ProcessResponse>(
      { jobId: job.id, sessionId: job.session_id, status: job.attempts < MAX_ATTEMPTS ? 'queued' : 'failed' },
      { status: 200 } // 200 so Vercel cron doesn't retry the cron itself
    )
  }

  // 7b. Success path
  await setJobStatus(supabase, job.id, 'complete', {
    completed_at: new Date().toISOString(),
  })
  await setSessionStatus(supabase, job.session_id, 'complete')

  console.log(`[process] Job ${job.id} completed successfully`)

  return NextResponse.json<ProcessResponse>({
    jobId: job.id,
    sessionId: job.session_id,
    status: 'complete',
  })
}
