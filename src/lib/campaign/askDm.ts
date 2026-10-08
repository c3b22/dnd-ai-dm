import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAdventureById } from '@/lib/adventures/adventures';
import { getSceneAsync } from '@/lib/scenes/scenes';
import { parseCharacterTags } from '@/lib/character/tags';
import { parseSceneTag } from '@/lib/scenes/scenes';
import { STORY_MESSAGE_ROLES } from '@/lib/messages/roles';
import { CAMPAIGN_ENDED_MESSAGE, isCampaignEnded } from './campaignEnd';

type Client = ReturnType<typeof createServiceRoleClient>;

export const MAX_ASK_LENGTH = 500;
export const ASK_LIMIT_PER_ROUND = 3;
const HISTORY_LIMIT = 12;

export class AskDmError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 409 | 429 | 502 = 400
  ) {
    super(message);
  }
}

export interface AskDmDeps {
  /** Sends the prompt to the AI and resolves to the full answer text. */
  answer: (prompt: string) => Promise<string>;
}

/** Removes every [[...]] tag, known or not: an answer must never carry a game-state tag. */
export function stripAllTags(text: string): string {
  const { cleanText } = parseCharacterTags(text);
  return parseSceneTag(cleanText)
    .cleanText.replace(/\[\[[^\]]*\]\]/g, '')
    .trim();
}

/**
 * Builds the free-question prompt. It deliberately takes no adventure secret, acts or NPC outline:
 * only what the table already knows (summary, recent narration, current place, public premise).
 */
export function buildAskPrompt(input: {
  summary: string;
  recent: { role: string; content: string }[];
  sceneName: string | null;
  premise: { title: string; tone: string; setting: string; hook: string } | null;
  question: string;
}): string {
  const history = input.recent.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  return [
    'You are the Dungeon Master of an ongoing D&D campaign. A player is asking you a private out-of-character question.',
    'Answer in Thai (ภาษาไทย), briefly (1-3 sentences), using only what the players already know from the story below.',
    'If the answer is not known to the players yet, say so in character-neutral terms; never invent or reveal hidden plot, secrets or future events.',
    'This is only a question: do not change the game state, do not roll dice, do not end or advance the round, and do not narrate new events.',
    'Do not output any [[...]] tags of any kind.',
    '',
    ...(input.premise
      ? [
          `Adventure: ${input.premise.title}`,
          `Tone: ${input.premise.tone}`,
          `Setting: ${input.premise.setting}`,
          `Opening hook: ${input.premise.hook}`,
          '',
        ]
      : []),
    ...(input.sceneName ? [`The party is currently at: ${input.sceneName}`, ''] : []),
    'Story so far:',
    input.summary || '(campaign just started)',
    '',
    'Recent narration and dialogue:',
    history || '(no recent messages)',
    '',
    `Player question: ${input.question}`,
  ].join('\n');
}

/**
 * Free "ask the DM" for a campaign member: at most ASK_LIMIT_PER_ROUND questions per player per
 * round. Saved as role='ask' + role='ask_answer' (same round, same player), never touches round state
 * and never feeds the story prompt.
 */
export async function askDm(
  supabase: Client,
  params: { campaignId: string; userId: string; question: unknown },
  deps: AskDmDeps
): Promise<{ answer: string }> {
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id, user_id')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (playerError) throw playerError;
  if (!player) throw new AskDmError('only campaign members can ask the DM', 403);

  if (await isCampaignEnded(supabase, params.campaignId)) throw new AskDmError(CAMPAIGN_ENDED_MESSAGE, 409);

  const question = typeof params.question === 'string' ? params.question.trim() : '';
  if (!question) throw new AskDmError('question is empty', 400);
  if (question.length > MAX_ASK_LENGTH) {
    throw new AskDmError(`question is too long (max ${MAX_ASK_LENGTH} characters)`, 400);
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('current_round_id, adventure_id, current_scene_id')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  const roundId = (campaign?.current_round_id as string | null) ?? null;
  if (!roundId) throw new AskDmError('no open round to ask in', 400);

  const { count, error: countError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', params.campaignId)
    .eq('role', 'ask')
    .eq('player_id', player.id)
    .eq('round_id', roundId);
  if (countError) throw countError;
  if ((count ?? 0) >= ASK_LIMIT_PER_ROUND) {
    throw new AskDmError(`you can ask at most ${ASK_LIMIT_PER_ROUND} questions per round`, 429);
  }

  const adventureId = (campaign?.adventure_id as string | null) ?? null;
  const adventure = await getAdventureById(supabase, adventureId);
  const scene = await getSceneAsync(supabase, adventureId, campaign?.current_scene_id as string | null);

  const { data: summaryRow } = await supabase
    .from('campaign_summary')
    .select('summary')
    .eq('campaign_id', params.campaignId)
    .maybeSingle();

  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('campaign_id', params.campaignId)
    .in('role', [...STORY_MESSAGE_ROLES])
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (messagesError) throw messagesError;

  // Explicit field pick on purpose: no `secret`, `acts` or `npcs` can reach the prompt.
  const prompt = buildAskPrompt({
    summary: (summaryRow?.summary as string | undefined) ?? '',
    recent: ((messageRows ?? []) as { role: string; content: string }[]).slice().reverse(),
    sceneName: scene?.nameTh ?? null,
    premise: adventure
      ? { title: adventure.title, tone: adventure.tone, setting: adventure.setting, hook: adventure.hook }
      : null,
    question,
  });

  let answer: string;
  try {
    answer = stripAllTags(await deps.answer(prompt));
  } catch {
    throw new AskDmError('the DM could not answer right now', 502);
  }
  if (!answer) throw new AskDmError('the DM could not answer right now', 502);

  const { error: insertError } = await supabase.from('messages').insert({
    campaign_id: params.campaignId,
    round_id: roundId,
    role: 'ask',
    player_id: player.id,
    content: question,
  });
  if (insertError) throw insertError;
  const { error: answerError } = await supabase.from('messages').insert({
    campaign_id: params.campaignId,
    round_id: roundId,
    role: 'ask_answer',
    player_id: player.id,
    content: answer,
  });
  if (answerError) throw answerError;

  return { answer };
}
