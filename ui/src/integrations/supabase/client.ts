import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client for the factory's database (Lovable Cloud).
 *
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the anon key;
 * VITE_SUPABASE_ANON_KEY is accepted too). Lovable Cloud projects already
 * provide these. Without them the console runs on sample data and says so.
 *
 * Only the public anon key ever belongs here: every factory table is
 * protected by row-level security, and the signed-in user's role decides
 * what they can read. Never put the service-role key in the frontend.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** True when the console reads the real database; false means sample data. */
export const isLive = supabase !== null;
