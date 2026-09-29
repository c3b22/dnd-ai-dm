import { getAdventure, formatAdventureForPrompt } from '@/lib/adventures/adventures';
import { sceneInstruction } from '@/lib/scenes/scenes';

export interface StoredMessage {
  role: 'dm' | 'player' | 'system';
  content: string;
}

export interface RoundAction {
  playerDisplayName: string;
  actionText: string;
  /** d20 the server rolled for this action; the DM must respect it. */
  roll?: number;
}

export function assemblePrompt(
  campaignSummary: string,
  recentMessages: StoredMessage[],
  actions: RoundAction[],
  adventureId?: string | null,
  currentSceneId?: string | null
): string {
  const adventure = getAdventure(adventureId);
  const historyText = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const inOrder = actions.length > 1;
  const actionsText = actions
    .map((a, i) => {
      const rolled = a.roll === undefined ? '' : ` (rolled ${a.roll} on a d20)`;
      return `${inOrder ? `${i + 1}. ` : ''}${a.playerDisplayName}${rolled}: ${a.actionText}`;
    })
    .join('\n');

  return [
    'You are the Dungeon Master for an ongoing D&D campaign.',
    'Narrate what happens next based on the players actions below.',
    'Always respond in Thai (ภาษาไทย), even if the players write in English.',
    '',
    ...(adventure ? [formatAdventureForPrompt(adventure), sceneInstruction(adventure.id, currentSceneId), ''] : []),
    'Story so far:',
    campaignSummary || '(campaign just started)',
    '',
    'Recent narration and dialogue:',
    historyText || '(no recent messages)',
    '',
    "This round's player actions" + (inOrder ? ' (listed in the order the players chose):' : ':'),
    actionsText,
    ...(inOrder
      ? [
          '',
          'Resolve these actions one at a time in exactly this order. Each later action happens after the earlier ones, so it can build on, be helped by, or be blocked by what the earlier ones just did (for example the first player opens a door and the second sneaks through). Decide each outcome separately and mention who is acting as you go.',
        ]
      : []),
    ...(actions.some((a) => a.roll !== undefined)
      ? [
          '',
          'The dice results above are final. Let each roll decide how well that action goes: 1 is a disaster, 2-7 fails or has a real cost, 8-14 succeeds with complications, 15-19 succeeds well, 20 is an exceptional success. Never contradict or re-roll them.',
        ]
      : []),
  ].join('\n');
}

const SUMMARY_ROTATION_THRESHOLD_CHARS = 8000;

export function shouldRotateSummary(recentMessages: StoredMessage[]): boolean {
  const totalChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  return totalChars > SUMMARY_ROTATION_THRESHOLD_CHARS;
}
