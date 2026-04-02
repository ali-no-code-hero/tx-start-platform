/**
 * Supabase URL + anon/publishable key for browser and server.
 * Vercel’s Supabase integration often sets SUPABASE_URL / SUPABASE_ANON_KEY;
 * this app expects NEXT_PUBLIC_* for the client — next.config forwards those at build time.
 */
export function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  );
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}
