import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';
import { getSharedAdventurePreview } from '@/lib/adventures/sharedAdventures';

// Public: no sign-in required.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    const preview = await getSharedAdventurePreview(createServiceRoleClient(), code);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof CustomAdventureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
