import { createServiceRoleClient } from '@/lib/supabase/server';

export async function findCampaignByJoinCode(
  supabase: ReturnType<typeof createServiceRoleClient>,
  joinCode: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('campaigns')
    .select('id')
    .eq('join_code', joinCode.toUpperCase())
    .maybeSingle();
  return data ?? null;
}
