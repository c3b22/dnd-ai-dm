import type { Adventure } from '@/lib/adventures/adventures';
import { formatAdventureForPrompt } from '@/lib/adventures/adventures';
import {
  DEFAULT_SETTINGS,
  diceInstructions,
  scopeInstructions,
  styleInstructions,
  type CampaignSettings,
} from '@/lib/campaign/settings';
import { characterPrompt } from '@/lib/character/prompt';
import { sanctuaryFor } from '@/lib/character/sanctuaries';
import type { Character } from '@/lib/character/types';
import { inventoryPrompt } from '@/lib/inventory/prompt';
import type { Inventories } from '@/lib/inventory/types';
import { economyPrompt } from '@/lib/economy/prompt';
import type { ShopState } from '@/lib/economy/apply';

export interface StoredMessage {
  role: 'dm' | 'player' | 'system';
  content: string;
}

export interface RoundAction {
  playerDisplayName: string;
  actionText: string;
  /** d20 the server rolled for this action; the DM must respect it. */
  roll?: number;
  /** Weapon the acting character wields and the damage the server rolled for it. */
  weaponLabel?: string;
  damage?: number;
  /** Set by the server from the round's action row; identifies the acting player. */
  playerId?: string;
  /** Catalog id of a consumable the player drinks this round. */
  useItemId?: string | null;
  /** True when the player triggers their class ability this round, with an optional ally target. */
  useAbility?: boolean;
  abilityTargetId?: string | null;
  /** Server-side outcome of the action (for example a potion drunk) that the narration must match. */
  note?: string;
}

export function assemblePrompt(
  campaignSummary: string,
  recentMessages: StoredMessage[],
  actions: RoundAction[],
  adventure: Adventure | null = null,
  sceneInstructionText = '',
  settings: CampaignSettings = DEFAULT_SETTINGS,
  characterState?: { characters: Character[]; pendingWipe: boolean; inventories?: Inventories; shop?: ShopState | null }
): string {
  const historyText = recentMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const inOrder = actions.length > 1;
  const actionsText = actions
    .map((a, i) => {
      const damage = a.damage === undefined ? '' : `, ${a.weaponLabel ?? 'weapon'} damage roll ${a.damage}`;
      const rolled = a.roll === undefined ? '' : ` (rolled ${a.roll} on a d20${damage})`;
      const note = a.note ? ` (server: ${a.note})` : '';
      return `${inOrder ? `${i + 1}. ` : ''}${a.playerDisplayName}${rolled}: ${a.actionText}${note}`;
    })
    .join('\n');

  return [
    'You are the Dungeon Master for an ongoing D&D campaign.',
    'Narrate what happens next based on the players actions below.',
    'Always respond in Thai (ภาษาไทย), even if the players write in English.',
    ...scopeInstructions(),
    ...styleInstructions(settings),
    '',
    ...(adventure ? [formatAdventureForPrompt(adventure), sceneInstructionText, ''] : []),
    'Story so far:',
    campaignSummary || '(campaign just started)',
    '',
    'Recent narration and dialogue:',
    historyText || '(no recent messages)',
    '',
    ...(characterState
      ? (() => {
          const block = characterPrompt(
            characterState.characters,
            characterState.pendingWipe,
            sanctuaryFor(adventure?.id ?? null)
          );
          const inventory = inventoryPrompt(characterState.characters, characterState.inventories ?? {});
          const economy = economyPrompt(characterState.characters, characterState.shop ?? null);
          return [
            ...(block.length ? [...block, ''] : []),
            ...(inventory.length ? [...inventory, ''] : []),
            ...(economy.length ? [...economy, ''] : []),
          ];
        })()
      : []),
    "This round's player actions" + (inOrder ? ' (listed in the order the players chose):' : ':'),
    actionsText,
    ...(inOrder
      ? [
          '',
          'Resolve these actions one at a time in exactly this order. Each later action happens after the earlier ones, so it can build on, be helped by, or be blocked by what the earlier ones just did (for example the first player opens a door and the second sneaks through). Decide each outcome separately and mention who is acting as you go.',
        ]
      : []),
    ...(() => {
      const dice = diceInstructions(settings, actions.some((a) => a.roll !== undefined));
      return dice.length ? ['', ...dice] : [];
    })(),
  ].join('\n');
}

const SUMMARY_ROTATION_THRESHOLD_CHARS = 8000;

export function shouldRotateSummary(recentMessages: StoredMessage[]): boolean {
  const totalChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  return totalChars > SUMMARY_ROTATION_THRESHOLD_CHARS;
}
