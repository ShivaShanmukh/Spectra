/**
 * CricketTrack Upload Test Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the full upload flow against your live Supabase project:
 *   1. DB connectivity + schema check
 *   2. Upload a video file to the "videos" storage bucket
 *   3. Confirm the session row is created in the database
 *   4. Confirm the file appears in Supabase Storage
 *   5. Clean up test data
 *
 * Run from the crickettrack project root:
 *   node --env-file=.env.local scripts/test-upload.mjs
 *
 * Optional: skip cleanup to inspect the data in your dashboard
 *   SKIP_CLEANUP=true node --env-file=.env.local scripts/test-upload.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SKIP_CLEANUP = process.env.SKIP_CLEANUP === 'true'

// Path to a real video file for the upload test
// Using the cricket video already in the Spectre folder
const VIDEO_PATH = path.resolve(
  '../AI_s_Cricket_Revolution__From_Umpiring_to_Kapil_Dev_Bots,_Is_Hu.mp4'
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

function pass(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); process.exitCode = 1 }
function info(msg) { console.log(`  ${CYAN}→${RESET} ${msg}`) }
function section(msg) { console.log(`\n${BOLD}${YELLOW}${msg}${RESET}`) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}CricketTrack — Upload Flow Test${RESET}`)
  console.log('─'.repeat(50))

  // ── Pre-flight checks ──────────────────────────────────────────────────────

  section('0. Pre-flight checks')

  if (!SUPABASE_URL) { fail('NEXT_PUBLIC_SUPABASE_URL not set in .env.local'); process.exit(1) }
  if (!SERVICE_ROLE_KEY) { fail('SUPABASE_SERVICE_ROLE_KEY not set in .env.local'); process.exit(1) }
  pass(`Supabase URL: ${SUPABASE_URL}`)

  if (!existsSync(VIDEO_PATH)) {
    fail(`Video file not found at: ${VIDEO_PATH}`)
    info('Update VIDEO_PATH in the script to point to any .mp4 file')
    process.exit(1)
  }
  pass(`Video file found: ${path.basename(VIDEO_PATH)}`)

  // ── Connect with service role (bypasses RLS for testing) ──────────────────

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. DB schema check ─────────────────────────────────────────────────────

  section('1. Database schema check')

  const tables = ['sessions', 'deliveries', 'analytics']
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1)
    if (error) {
      fail(`Table "${table}" — ${error.message}`)
    } else {
      pass(`Table "${table}" exists and is accessible`)
    }
  }

  // ── 2. Storage bucket check ────────────────────────────────────────────────

  section('2. Storage bucket check')

  const buckets = ['videos', 'clips']
  for (const bucket of buckets) {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1 })
    if (error) {
      fail(`Bucket "${bucket}" — ${error.message}`)
    } else {
      pass(`Bucket "${bucket}" accessible (${data.length} existing files peeked)`)
    }
  }

  // ── 3. Create a temporary test user in auth.users ─────────────────────────

  section('3. Creating temporary test user')

  const TEST_EMAIL = `test-${Date.now()}@crickettrack.test`
  const { data: newUser, error: userError } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: 'TestPass123!',
    email_confirm: true,
  })

  if (userError || !newUser?.user) {
    fail(`Could not create test user — ${userError?.message}`)
    process.exit(1)
  }
  const TEST_USER_ID = newUser.user.id
  pass(`Test user created: ${TEST_EMAIL}`)
  info(`User ID: ${TEST_USER_ID}`)

  // ── 4. Upload test video ───────────────────────────────────────────────────

  section('4. Uploading test video to "videos" bucket')

  const videoBuffer = await readFile(VIDEO_PATH)
  const fileSizeMB = (videoBuffer.byteLength / 1024 / 1024).toFixed(1)
  info(`File size: ${fileSizeMB} MB`)

  const storagePath = `${TEST_USER_ID}/test-${Date.now()}.mp4`

  const { error: storageError } = await supabase.storage
    .from('videos')
    .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: false })

  if (storageError) {
    fail(`Storage upload failed — ${storageError.message}`)
    process.exit(1)
  }
  pass(`Video uploaded to: videos/${storagePath}`)

  // ── 5. Create session row ──────────────────────────────────────────────────

  section('5. Creating session row in database')

  const { data: session, error: dbError } = await supabase
    .from('sessions')
    .insert({
      user_id: TEST_USER_ID,
      bowler_name: 'Test Bowler',
      notes: 'Automated test run',
      video_url: storagePath,
      status: 'uploaded',
    })
    .select()
    .single()

  if (dbError || !session) {
    fail(`DB insert failed — ${dbError?.message}`)
    process.exit(1)
  }
  pass(`Session row created`)
  info(`Session ID : ${session.id}`)
  info(`Bowler     : ${session.bowler_name}`)
  info(`Status     : ${session.status}`)
  info(`Video URL  : ${session.video_url}`)

  // ── 6. Verify session exists in DB ────────────────────────────────────────

  section('6. Verifying session row in database')

  const { data: fetched, error: fetchError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session.id)
    .single()

  if (fetchError || !fetched) {
    fail(`Could not fetch session back — ${fetchError?.message}`)
  } else {
    pass(`Session row confirmed in DB`)
    pass(`Status is "${fetched.status}"`)
  }

  // ── 7. Verify file exists in storage ──────────────────────────────────────

  section('7. Verifying file in Supabase Storage')

  const folder = `${TEST_USER_ID}/`
  const filename = storagePath.replace(folder, '')

  const { data: storageList, error: listError } = await supabase.storage
    .from('videos')
    .list(folder, { search: filename })

  if (listError || !storageList?.length) {
    fail(`File not found in storage — ${listError?.message ?? 'not listed'}`)
  } else {
    pass(`File confirmed in storage: ${storageList[0].name}`)
    info(`Size: ${(storageList[0].metadata?.size / 1024 / 1024).toFixed(1)} MB`)
  }

  // ── 8. Generate signed URL ─────────────────────────────────────────────────

  section('8. Generating signed URL')

  const { data: signed, error: signedError } = await supabase.storage
    .from('videos')
    .createSignedUrl(storagePath, 60)

  if (signedError || !signed) {
    fail(`Signed URL failed — ${signedError?.message}`)
  } else {
    pass('Signed URL generated successfully')
    info(`URL (valid 60s): ${signed.signedUrl.slice(0, 80)}...`)
  }

  // ── 9. Cleanup ─────────────────────────────────────────────────────────────

  section('9. Cleanup')

  if (SKIP_CLEANUP) {
    info('SKIP_CLEANUP=true — leaving test data in place')
    info(`Session ID to inspect: ${session.id}`)
    info(`Storage path: videos/${storagePath}`)
  } else {
    const { error: delDbError } = await supabase
      .from('sessions')
      .delete()
      .eq('id', session.id)

    if (delDbError) {
      fail(`DB cleanup failed — ${delDbError.message}`)
    } else {
      pass('Test session row deleted')
    }

    const { error: delStorageError } = await supabase.storage
      .from('videos')
      .remove([storagePath])

    if (delStorageError) {
      fail(`Storage cleanup failed — ${delStorageError.message}`)
    } else {
      pass('Test video file deleted from storage')
    }

    const { error: delUserError } = await supabase.auth.admin.deleteUser(TEST_USER_ID)
    if (delUserError) {
      fail(`User cleanup failed — ${delUserError.message}`)
    } else {
      pass('Test user deleted from auth.users')
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(50))
  if (process.exitCode === 1) {
    console.log(`${RED}${BOLD}Some tests failed. Check errors above.${RESET}\n`)
  } else {
    console.log(`${GREEN}${BOLD}All tests passed. Upload flow is working.${RESET}\n`)
  }
}

main().catch((err) => {
  console.error(`\n${RED}Unexpected error:${RESET}`, err.message)
  process.exit(1)
})
