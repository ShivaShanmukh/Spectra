import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus = 'uploaded' | 'processing' | 'complete' | 'failed'

export type Session = {
  id: string
  user_id: string
  bowler_name: string
  recorded_at: string
  notes: string | null
  video_url: string        // storage path — use getSignedVideoUrl() for display
  status: SessionStatus
  created_at: string
}

export type LengthType = 'yorker' | 'full' | 'good_length' | 'short'
export type LineType = 'on_line' | 'off_line'

export type BallPathPoint = {
  frame: number
  x: number
  y: number
}

export type Delivery = {
  id: string
  session_id: string
  delivery_number: number
  pitch_x: number
  pitch_y: number
  length_type: LengthType
  line_type: LineType
  speed_estimate: number
  ball_path: BallPathPoint[]
  clip_url: string | null
  created_at: string
}

export type LengthDistribution = {
  yorker: number
  full: number
  good_length: number
  short: number
}

export type Analytics = {
  id: string
  session_id: string
  total_deliveries: number
  line_consistency_pct: number
  length_distribution: LengthDistribution
  avg_speed: number
  max_speed: number
  min_speed: number
  summary_text: string | null
  created_at: string
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class SessionError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'SessionError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a signed URL for a private video.
 * Default expiry: 1 hour. Pass a longer value for download links.
 */
export async function getSignedVideoUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(storagePath, expiresInSeconds)

  if (error || !data) {
    throw new SessionError('SIGNED_URL_ERROR', error?.message ?? 'Failed to generate video URL')
  }
  return data.signedUrl
}

// ─── Session functions ────────────────────────────────────────────────────────

/**
 * Create a new session row after a video has been uploaded.
 */
export async function createSession(
  userId: string,
  bowlerName: string,
  videoUrl: string,
  notes?: string
): Promise<Session> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      bowler_name: bowlerName,
      video_url: videoUrl,
      notes: notes ?? null,
      status: 'uploaded',
    })
    .select()
    .single()

  if (error || !data) {
    throw new SessionError('CREATE_FAILED', error?.message ?? 'Failed to create session')
  }
  return data as Session
}

/**
 * Fetch a single session by ID.
 * Throws if not found or if the user doesn't own it (RLS enforces this).
 */
export async function getSession(sessionId: string): Promise<Session> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !data) {
    throw new SessionError('NOT_FOUND', error?.message ?? 'Session not found')
  }
  return data as Session
}

/**
 * Update the processing status of a session.
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('sessions')
    .update({ status })
    .eq('id', sessionId)

  if (error) {
    throw new SessionError('UPDATE_FAILED', error.message)
  }
}

/**
 * Fetch all sessions for a user, newest first.
 */
export async function getSessions(userId: string): Promise<Session[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new SessionError('FETCH_FAILED', error.message)
  }
  return (data ?? []) as Session[]
}

/**
 * Delete a session and its storage video.
 * Deletes the DB row first — RLS will reject if not owner.
 * Then removes the file from storage.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createClient()

  // Fetch the storage path before deleting the row
  const session = await getSession(sessionId)

  const { error: dbError } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)

  if (dbError) {
    throw new SessionError('DELETE_FAILED', dbError.message)
  }

  // Best-effort storage cleanup — don't throw if this fails
  if (session.video_url) {
    await supabase.storage.from('videos').remove([session.video_url])
  }
}
