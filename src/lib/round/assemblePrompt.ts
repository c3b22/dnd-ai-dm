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
import { memoryPrompt } from '@/lib/memory/prompt';
import type { CampaignFact } from '@/lib/memory/types';
import { combatPrompt } from '@/lib/combat/prompt';
import type { Encounter } from '@/lib/combat/encounter';
import { isStoryRole, type MessageRole } from '@/lib/messages/roles';
import { checkPlanInstructions, type CheckOutcome } from '@/lib/character/checkPlan';
import type { AttackOutcome } from '@/lib/combat/attack';

export interface StoredMessage {
  role: MessageRole;
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
  /** Name of the enemy a scroll (useItemId) is aimed at (F5e). */
  itemTarget?: string | null;
  /** True when the player triggers their class ability this round, with an optional ally target. */
  useAbility?: boolean;
  abilityTargetId?: string | null;
  /** Server-side outcome of the action (for example a potion drunk) that the narration must match. */
  note?: string;
  /** Skill check the server rolled for this action; the narration must match its success or failure. */
  check?: CheckOutcome;
  /** Attack on an enemy the server rolled for this action (C8); the narration must match it. */
  attack?: AttackOutcome;
}

export interface AssembleOptions {
  /** First call of a dice round: the DM answers with a JSON check plan or the narration instead of narrating directly. */
  planChecks?: boolean;
}

function attackText(a: AttackOutcome): string {
  const adv = a.advantage === 'none' ? '' : ` with ${a.advantage} (rolled ${a.dice.join(' and ')})`;
  const crit = a.critical === 'success' ? ', natural 20' : a.critical === 'failure' ? ', natural 1' : '';
  const after = a.defeated ? 'the enemy is defeated' : 'the enemy is still standing';
  const result = !a.hit ? 'MISS, the enemy is unharmed' : `${a.pips >= 2 ? 'HEAVY HIT, a devastating blow' : 'HIT, a solid wound'}, ${after}`;
  return ` (attack on ${a.target}${adv}: d20 ${a.die}${crit} vs ${a.dc} -> ${result})`;
}

function checkText(c: CheckOutcome): string {
  const adv = c.advantage === 'none' ? '' : ` with ${c.advantage} (rolled ${c.dice.join(' and ')})`;
  const crit = c.critical === 'success' ? ', natural 20' : c.critical === 'failure' ? ', natural 1' : '';
  const bonus = c.modifier + c.proficiency + (c.itemBonus ?? 0);
  return ` (${c.skill} check DC ${c.dc}${adv}: d20 ${c.die} ${bonus >= 0 ? '+' : '-'} ${Math.abs(bonus)} = ${c.total}${crit} -> ${c.success ? 'SUCCESS' : 'FAILURE'})`;
}

export function assemblePrompt(
  campaignSummary: string,
  recentMessages: StoredMessage[],
  actions: RoundAction[],
  adventure: Adventure | null = null,
  sceneInstructionText = '',
  settings: CampaignSettings = DEFAULT_SETTINGS,
  characterState?: { characters: Character[]; pendingWipe: boolean; inventories?: Inventories; shop?: ShopState | null; encounter?: Encounter | null },
  facts: CampaignFact[] = [],
  options: AssembleOptions = {}
): string {
  // Defensive: ooc/ask/ask_answer must never reach the AI prompt (also filtered at the query).
  const historyText = recentMessages
    .filter((m) => isStoryRole(m.role))
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const inOrder = actions.length > 1;
  const actionsText = actions
    .map((a, i) => {
      const damage = a.damage === undefined ? '' : `, ${a.weaponLabel ?? 'weapon'} damage roll ${a.damage}`;
      const rolled = a.attack ? attackText(a.attack) : a.check ? checkText(a.check) + damage : a.roll === undefined ? '' : ` (rolled ${a.roll} on a d20${damage})`;
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
    // World memory is its own section, not part of the summary, so summarizing never drops it.
    ...memoryPrompt(facts),
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
          const combat = combatPrompt(characterState.encounter ?? null, settings.diceEnabled && characterState.characters.length > 0);
          return [
            ...(block.length ? [...block, ''] : []),
            ...(inventory.length ? [...inventory, ''] : []),
            ...(economy.length ? [...economy, ''] : []),
            ...combat,
            '',
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
    ...(actions.some((a) => a.check || a.attack)
      ? ['', 'Skill checks and attacks above are final and decided by the server: narrate each SUCCESS or HIT as the player achieving what they tried and each FAILURE or MISS as it going wrong or falling short. Never re-roll or change them.']
      : []),
    ...(options.planChecks ? ['', ...checkPlanInstructions(!!characterState?.encounter)] : []),
  ].join('\n');
}

const SUMMARY_ROTATION_THRESHOLD_CHARS = 8000;

export function shouldRotateSummary(recentMessages: StoredMessage[]): boolean {
  const totalChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  return totalChars > SUMMARY_ROTATION_THRESHOLD_CHARS;
}
