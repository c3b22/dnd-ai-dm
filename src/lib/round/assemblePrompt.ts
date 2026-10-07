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
import { corpsePrompt, type LootableCorpse } from '@/lib/character/loot';
import type { Inventories } from '@/lib/inventory/types';
import { economyPrompt } from '@/lib/economy/prompt';
import type { ShopState } from '@/lib/economy/apply';
import { memoryPrompt } from '@/lib/memory/prompt';
import type { CampaignFact } from '@/lib/memory/types';
import { combatPrompt } from '@/lib/combat/prompt';
import type { Encounter } from '@/lib/combat/encounter';
import { isStoryRole, type MessageRole } from '@/lib/messages/roles';
import { checkPlanInstructions, type CheckOutcome } from '@/lib/character/checkPlan';
import type { AttackOutcome, EnemyAttackOutcome } from '@/lib/combat/attack';

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
  /** I2: enemy attacks the server already rolled this round; the narration must match them. */
  enemyAttacks?: EnemyAttackOutcome[];
  /** J3: the team's passed rest vote. With `planChecks` the DM must answer `rest`; `answer` is set on the narration call. */
  rest?: { kind: 'short' | 'long'; answer?: 'ok' | 'interrupted' };
}

function restLines(rest: NonNullable<AssembleOptions['rest']>, planChecks: boolean): string[] {
  const label = rest.kind === 'long' ? 'long rest (a night of sleep)' : 'short rest (about an hour)';
  if (rest.answer === 'ok') {
    return ['', `The team's ${label} was approved and the server has restored them; narrate a quiet, undisturbed rest.`];
  }
  if (rest.answer === 'interrupted') {
    return ['', `The team tried to take a ${label} but it was INTERRUPTED; narrate the event that cuts the rest short (you may start an encounter with an enemy tag). Nobody recovers anything.`];
  }
  if (!planChecks) return [];
  return [
    '',
    `The team voted to take a ${label} this round. In your JSON answer (either shape) add "rest": "ok" if nothing prevents it${rest.kind === 'long' ? ' and the place is safe enough to sleep' : ''}, or "rest": "interrupted" if an event interrupts it (you may then open an encounter with an enemy tag in your narration). Only the server restores HP and abilities, so never say numbers yourself. Leave "rest" out and the team does not rest.`,
  ];
}

function attackText(a: AttackOutcome): string {
  const adv = a.advantage === 'none' ? '' : ` with ${a.advantage} (rolled ${a.dice.join(' and ')})`;
  const crit = a.critical === 'success' ? ', natural 20' : a.critical === 'failure' ? ', natural 1' : '';
  const after = a.defeated ? 'the enemy is defeated' : 'the enemy is still standing';
  const result = !a.hit ? 'MISS, the enemy is unharmed' : `${a.pips >= 2 ? 'HEAVY HIT, a devastating blow' : 'HIT, a solid wound'}, ${after}`;
  const bonus = a.modifier + a.proficiency + a.magic;
  return ` (attack on ${a.target}${adv}: d20 ${a.die}${crit} ${bonus < 0 ? '-' : '+'} ${Math.abs(bonus)} = ${a.total} vs armor class ${a.dc} -> ${result})`;
}

function enemyAttackText(o: EnemyAttackOutcome): string {
  const crit = o.critical === 'success' ? ', natural 20' : o.critical === 'failure' ? ', natural 1' : '';
  const result = !o.hit ? 'MISS, the player is unharmed' : o.critical === 'success' ? 'CRITICAL HIT, a brutal wound' : 'HIT, the player is wounded';
  return `- ${o.enemy} attacks ${o.playerDisplayName}: d20 ${o.die} + ${o.bonus} = ${o.total}${crit} vs armor class ${o.ac}${o.advantage ? ' (rolled with advantage, the pack presses in)' : ''} -> ${result}${o.venomous ? ', and the venom seeps in (the player will feel it next round)' : ''}`;
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
  characterState?: { characters: Character[]; pendingWipe: boolean; inventories?: Inventories; shop?: ShopState | null; encounter?: Encounter | null; corpses?: LootableCorpse[] },
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
          const corpseBlock = corpsePrompt(characterState.corpses ?? []);
          const economy = economyPrompt(characterState.characters, characterState.shop ?? null);
          const combat = combatPrompt(characterState.encounter ?? null, settings.diceEnabled && characterState.characters.length > 0);
          return [
            ...(block.length ? [...block, ''] : []),
            ...(inventory.length ? [...inventory, ''] : []),
            ...(corpseBlock.length ? [...corpseBlock, ''] : []),
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
    ...(options.enemyAttacks && options.enemyAttacks.length > 0
      ? ['', 'Enemy attacks this round, rolled and final (decided by the server; narrate each HIT as the enemy landing the blow and each MISS as it failing; never state damage numbers, never use an enemy_attack tag for them):', ...options.enemyAttacks.map(enemyAttackText)]
      : []),
    ...(options.rest ? restLines(options.rest, !!options.planChecks) : []),
    ...(options.planChecks ? ['', ...checkPlanInstructions(!!characterState?.encounter)] : []),
  ].join('\n');
}

const SUMMARY_ROTATION_THRESHOLD_CHARS = 8000;

export function shouldRotateSummary(recentMessages: StoredMessage[]): boolean {
  const totalChars = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
  return totalChars > SUMMARY_ROTATION_THRESHOLD_CHARS;
}
