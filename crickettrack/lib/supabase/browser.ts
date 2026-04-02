import { createBrowserClient } from '@supabase/ssr'

// Singleton browser client — safe to call multiple times
let client: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
