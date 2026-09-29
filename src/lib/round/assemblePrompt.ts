import { getAdventure, formatAdventureForPrompt } from '@/lib/adventures/adventures';
import { sceneInstruction } from '@/lib/scenes/scenes';

export interface StoredMessage {
  role: 'dm' | 'player' | 'system';
  content: string;
}

export interface RoundAction {
  playerDisplayName: string;
  actionText: string;
}

export function assemblePrompt(
  campaignSummary: string,
  recentMessages: StoredMessage[],
  actions: RoundAction[],
  adventureId?: string | null
): string {
  const adventure = getAdventure(adventureId);
  const historyText = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const actionsText = actions
    .map((a) => `${a.playerDisplayName}: ${a.actionText}`)
    .join('\n');

  return [
    'You are the Dungeon Master for an ongoing D&D campaign.',
    'Narrate what happens next based on the players actions below.',
    'Always respond in Thai (ภาษาไทย), even if the players write in English.',
    '',
    ...(adventure ? [formatAdventureForPrompt(adventure), sceneInstruction(adventure.id), ''] : []),
    'Story so far:',
    campaignSummary || '(campaign just started)',
    '',
    'Recent narration and dialogue:',
    historyText || '(no recent messages)',
    '',
    "This round's player actions:",
    actionsText,
  ].join('\n');
}

const SUMMARY_ROTATION_THRESHOLD_CHARS = 8000;

export function shouldRotateSummary(recentMessages: StoredMessage[]): boolean {
  const totalChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  return totalChars > SUMMARY_ROTATION_THRESHOLD_CHARS;
}
