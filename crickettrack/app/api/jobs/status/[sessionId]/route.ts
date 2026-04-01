import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus = 'queued' | 'processing' | 'complete' | 'failed'
type SessionStatus = 'uploaded' | 'processing' | 'complete' | 'failed'

type JobStatusResponse = {
  sessionId: string
  jobId: string
  jobStatus: JobStatus
  sessionStatus: SessionStatus
  attempts: number
  lastError: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

type Params = { sessionId: string }

// ─── GET /api/jobs/status/[sessionId] ─────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Params }
) {
  const { sessionId } = params

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const supabase = await createClient()

  // Auth check — RLS on processing_jobs ensures users only see their own jobs,
  // but we verify the session ownership explicitly for a clear 403 vs 404.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch job + session in one query via join
  const { data, error } = await supabase
    .from('processing_jobs')
    .select(`
      id,
      status,
      attempts,
      last_error,
      started_at,
      completed_at,
      created_at,
      sessions!inner ( id, status, user_id )
    `)
    .eq('session_id', sessionId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Explicit ownership check (belt + RLS suspenders)
  const session = data.sessions as unknown as {
    id: string
    status: SessionStatus
    user_id: string
  }

  if (session.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json<JobStatusResponse>({
    sessionId,
    jobId: data.id,
    jobStatus: data.status as JobStatus,
    sessionStatus: session.status,
    attempts: data.attempts,
    lastError: data.last_error,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    createdAt: data.created_at,
  })
}
