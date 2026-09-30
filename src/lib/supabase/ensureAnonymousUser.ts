import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Every anonymous sign-in mints a brand-new user, and players belong to a campaign through
 * that user id. Signing in again on each create/join would strand every earlier campaign, so
 * an existing session is reused and only a first-time browser gets a new anonymous user.
 */
export async function ensureAnonymousUser(
  supabase: SupabaseClient
): Promise<{ user: User | null; error: Error | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return { user: sessionData.session.user, error: null };

  const { data, error } = await supabase.auth.signInAnonymously();
  return { user: data.user ?? null, error };
}
