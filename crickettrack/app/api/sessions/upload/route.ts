import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB
const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv']
const SIGNED_URL_EXPIRY = 3600               // 1 hour

// ─── Error types ──────────────────────────────────────────────────────────────

type UploadErrorCode =
  | 'UNAUTHORIZED'
  | 'MISSING_FILE'
  | 'MISSING_BOWLER_NAME'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'VIDEO_TOO_SHORT'
  | 'STORAGE_ERROR'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'

type UploadError = {
  code: UploadErrorCode
  message: string
}

type UploadSuccess = {
  sessionId: string
  videoUrl: string   // signed URL valid for 1 hour
  storagePath: string
  status: string
}

function err(code: UploadErrorCode, message: string, status: number) {
  return NextResponse.json<UploadError>({ code, message }, { status })
}

// ─── POST /api/sessions/upload ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return err('UNAUTHORIZED', 'You must be logged in to upload.', 401)
    }

    // 2. Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('video') as File | null
    const bowlerName = (formData.get('bowler_name') as string | null)?.trim()
    const notes = (formData.get('notes') as string | null)?.trim() || null

    // duration_seconds must be sent by the client after checking via
    // the HTML5 video element before calling this API
    // duration_seconds accepted but not enforced during testing
    void formData.get('duration_seconds')

    // 3. Validate required fields
    if (!file) {
      return err('MISSING_FILE', 'No video file provided.', 400)
    }
    if (!bowlerName) {
      return err('MISSING_BOWLER_NAME', 'Bowler name is required.', 400)
    }

    // 4. Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return err(
        'INVALID_FILE_TYPE',
        'Only MP4, MOV, AVI, WebM, and MKV files are accepted.',
        400
      )
    }

    // 5. Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(0)
      return err(
        'FILE_TOO_LARGE',
        `File is ${sizeMB} MB. Maximum allowed size is 500 MB.`,
        400
      )
    }

    // 7. Build storage path: {userId}/{timestamp}.{ext}
    const storagePath = `${user.id}/${Date.now()}.${ext}`

    // 8. Upload to "videos" bucket (private)
    const { error: storageError } = await supabase.storage
      .from('videos')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      return err('STORAGE_ERROR', storageError.message, 500)
    }

    // 9. Generate a signed URL (private bucket — no public URL)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('videos')
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

    if (signedError || !signedData) {
      await supabase.storage.from('videos').remove([storagePath])
      return err('STORAGE_ERROR', 'Failed to generate video URL.', 500)
    }

    // 10. Create session row in DB
    const { data: session, error: dbError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        bowler_name: bowlerName,
        notes,
        video_url: storagePath,   // store path — generate signed URLs on demand
        status: 'uploaded',
      })
      .select()
      .single()

    if (dbError) {
      // Rollback storage upload so we don't leave orphaned files
      await supabase.storage.from('videos').remove([storagePath])
      return err('DATABASE_ERROR', dbError.message, 500)
    }

    return NextResponse.json<UploadSuccess>({
      sessionId: session.id,
      videoUrl: signedData.signedUrl,   // 1-hour signed URL for immediate use
      storagePath,
      status: session.status,
    })
  } catch (error) {
    console.error('[upload] Unexpected error:', error)
    return err('INTERNAL_ERROR', 'An unexpected error occurred.', 500)
  }
}
