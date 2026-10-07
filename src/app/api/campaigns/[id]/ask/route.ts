import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { AskDmError, askDm } from '@/lib/campaign/askDm';
import { generateNarration } from '@/lib/ai/geminiClient';
import { realGeminiDeps } from '@/lib/ai/vercelAiSdkAdapter';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  try {
    const result = await askDm(
      supabase,
      { campaignId: id, userId: authData.user.id, question: body?.question },
      {
        answer: async (prompt) => {
          const stream = await generateNarration(prompt, realGeminiDeps);
          let text = '';
          for await (const chunk of stream) text += chunk;
          return text;
        },
      }
    );
    return NextResponse.json({ answer: result.answer });
  } catch (error) {
    if (error instanceof AskDmError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
