import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';
import { uploadSceneImage } from '@/lib/adventures/sceneImage';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> }
) {
  const { id, key } = await params;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const imageUrl = await uploadSceneImage(supabase, {
      adventureId: id,
      key,
      ownerId: authData.user.id,
      file,
    });
    return NextResponse.json({ imageUrl });
  } catch (error) {
    if (error instanceof CustomAdventureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
