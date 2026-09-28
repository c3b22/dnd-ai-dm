import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment variables');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
