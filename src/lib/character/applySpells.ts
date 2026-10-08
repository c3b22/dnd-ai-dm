/**
 * K4: resolves this round's spell casts before narration (like applyAbilityActions does for class abilities).
 * Pure: nothing is saved here; the caller writes the slots, pips and cooldowns at the end of the round.
 *
 * An action casts a spell when it carries `spellId`. Its target is an enemy name (`itemTarget`, the same
 * column scrolls use) or a friend (`abilityTargetId`). `useAbility` on a mage means the arcane surge: the
 * spell is free and, from level 5, stronger. A surge is spent (its cooldown starts) only when the cast worked.
 */
import { cooldownOf } from './applyAbilities';
import { classOf } from './classes';
import { FEARSOME_ROUND } from '@/lib/combat/constants';
import { hasTrait, type Encounter } from '@/lib/combat/encounter';
import { shiftAdvantage, type Advantage } from './check';
import { hasSubclass } from './subclasses';
import { EVOKER_EXTRA_PIPS, WARDER_FREE_SELF_SPELLS } from './subclassConstants';
import { damageEnemy, findActiveEnemy } from '@/lib/combat/encounter';
import { emptyRoundEffects, isSpellId, resolveSpell, SPELLS, spellSlotsOf, type RoundEffects, type SpellRoll } from './spells';
import type { Character } from './types';

export interface SpellAction {
  playerId?: string;
  useItemId?: string | null;
  useAbility?: boolean;
  abilityId?: string | null;
  abilityTargetId?: string | null;
  /** Enemy name for an enemy spell. */
  itemTarget?: string | null;
  spellId?: string | null;
}

/** One spell roll, ready for the posted roll summary (and the dice overlay). */
export interface SpellRollEntry extends SpellRoll {
  playerDisplayName: string;
  spellNameTh: string;
}

export interface SpellActionsResult {
  /** Characters after the round's spells: slots spent, plus the transient AC / ward bonuses of this round. */
  characters: Character[];
  /** The encounter after the spells' pip losses (the input one when nothing hit). */
  encounter: Encounter | null;
  effects: RoundEffects;
  /** Outcome for the DM, keyed by the casting player. */
  notes: Record<string, string>;
  /** Thai lines for the game log. */
  changes: string[];
  rolls: SpellRollEntry[];
  /** Players whose cast worked (their weapon attack does not happen this round). */
  casters: string[];
  /** Mages whose arcane surge worked, so the surge cooldown starts. */
  surgeUsed: string[];
}

const SURGE_ID = 'mage';

function mergeEffects(into: RoundEffects, add: RoundEffects): void {
  for (const [id, n] of Object.entries(add.acBonus)) into.acBonus[id] = (into.acBonus[id] ?? 0) + n;
  for (const [id, n] of Object.entries(add.ward)) into.ward[id] = Math.max(into.ward[id] ?? 0, n);
  for (const id of add.advantage) into.advantage.add(id);
  for (const [id, skills] of Object.entries(add.skillAdvantage)) into.skillAdvantage[id] = [...new Set([...(into.skillAdvantage[id] ?? []), ...skills])];
  for (const [enemy, statuses] of Object.entries(add.enemy)) into.enemy[enemy] = [...new Set([...(into.enemy[enemy] ?? []), ...statuses])];
  for (const [id, n] of Object.entries(add.cooldownCut)) into.cooldownCut[id] = (into.cooldownCut[id] ?? 0) + n;
  for (const [id, mods] of Object.entries(add.attackMods ?? {})) into.attackMods = { ...into.attackMods, [id]: { ...into.attackMods?.[id], ...mods } };
}

export function applySpellActions(input: {
  characters: Character[];
  actions: SpellAction[];
  encounter: Encounter | null;
  rollDie: () => number;
  /** K5: effects already set this round by class abilities (ward, AC, statuses, attack modifiers); spells add to them. */
  effects?: RoundEffects;
}): SpellActionsResult {
  let characters = input.characters.map((c) => ({ ...c }));
  let encounter = input.encounter;
  const effects = emptyRoundEffects();
  if (input.effects) mergeEffects(effects, input.effects);
  const notes: Record<string, string> = {};
  const changes: string[] = [];
  const rolls: SpellRollEntry[] = [];
  const casters: string[] = [];
  const surgeUsed: string[] = [];
  /** K5: casters whose once-per-round warder free cast / evoker extra pip is already spent. */
  const freeCastSpent = new Set<string>();
  const extraPipSpent = new Set<string>();

  for (const action of input.actions) {
    if (!action.playerId || action.useItemId) continue;
    const caster = characters.find((c) => c.id === action.playerId);
    if (!caster || classOf(caster.classId)?.id !== 'mage') continue;
    if (!action.spellId) {
      // The surge only exists as part of a cast; on its own it does nothing and costs nothing.
      if (action.useAbility) notes[caster.id] = 'tried to use the arcane surge without choosing a spell, so nothing happened';
      continue;
    }
    if (!isSpellId(action.spellId)) {
      notes[caster.id] = 'tried to cast an unknown spell, so nothing happened';
      continue;
    }
    const spell = SPELLS[action.spellId];
    const wantsSurge = Boolean(action.useAbility) && (!action.abilityId || action.abilityId === SURGE_ID);
    const surgeReady = wantsSurge && cooldownOf(caster, SURGE_ID) <= 0;
    const enemyTarget = spell.target === 'enemy';
    const target = enemyTarget ? (action.itemTarget ?? undefined) : (action.abilityTargetId ?? action.itemTarget ?? undefined);

    // Advantage: a blessing cast earlier this round (the table's turn order), then fearsome takes one step back.
    let advantage: Advantage = effects.advantage.has(caster.id) ? 'advantage' : 'none';
    const frightened = encounter && (encounter.round ?? 1) === FEARSOME_ROUND && encounter.enemies.some((e) => e.pip > 0 && !e.fled && hasTrait(e, 'fearsome'));
    if (frightened) advantage = shiftAdvantage(advantage, 'down');

    // K5 mage_warder: the first defense/support spell cast on themselves each round costs no slot.
    const selfTarget = target !== undefined && (target === caster.id || target === caster.displayName);
    const freeCast = !surgeReady && hasSubclass(caster, 'mage_warder') && !freeCastSpent.has(caster.id) && selfTarget && WARDER_FREE_SELF_SPELLS.includes(action.spellId);

    const result = resolveSpell({
      caster,
      spellId: action.spellId,
      target,
      allies: characters,
      encounter,
      surge: surgeReady,
      freeCast,
      advantage,
      d20: input.rollDie,
    });
    const lines = [...result.notes];
    if (wantsSurge && !surgeReady) lines.unshift(`${caster.displayName} ใช้เวทไหลล้นไม่ได้ (ยังติด cooldown) จึงร่ายแบบเสียช่องเวทตามปกติ`);
    notes[caster.id] = result.ok
      ? lines.join(' | ')
      : `tried to cast ${spell.nameTh} but it failed (${result.reason}): ${lines.join(' | ')}`;
    if (!result.ok) {
      changes.push(lines[lines.length - 1] ?? `${caster.displayName} ร่าย${spell.nameTh}ไม่สำเร็จ`);
      continue;
    }
    if (freeCast) freeCastSpent.add(caster.id);
    // K5 mage_evoker: the first spell of the round that took pips off takes one more off the first enemy it hurt.
    if (hasSubclass(caster, 'mage_evoker') && !extraPipSpent.has(caster.id) && result.encounter) {
      const hurt = result.rolls.find((r) => r.pips > 0);
      if (hurt) {
        extraPipSpent.add(caster.id);
        const enemies = result.encounter.enemies.map((e) => ({ ...e }));
        const enemy = findActiveEnemy(enemies, hurt.target);
        if (enemy) {
          damageEnemy(enemy, EVOKER_EXTRA_PIPS);
          hurt.pips += EVOKER_EXTRA_PIPS;
          result.encounter = { ...result.encounter, enemies };
          lines.push(`สายทำลายล้าง: ${enemy.name} −${EVOKER_EXTRA_PIPS} pip เพิ่ม`);
        }
      }
    }
    characters = characters.map((c) => (c.id === caster.id ? result.caster : c));
    encounter = result.encounter;
    mergeEffects(effects, result.effects);
    for (const r of result.rolls) rolls.push({ ...r, playerDisplayName: caster.displayName, spellNameTh: spell.nameTh });
    casters.push(caster.id);
    if (surgeReady) surgeUsed.push(caster.id);
    changes.push(...lines);
    if (result.slotCost > 0) {
      const left = spellSlotsOf(result.caster);
      if (left) changes.push(`${caster.displayName} ใช้ช่องเวท เหลือ ${left.current}/${left.max}`);
    }
  }

  // The transient per-round bonuses ride on the characters so every later step (enemy attacks, tag damage) sees them.
  characters = characters.map((c) => {
    const ac = effects.acBonus[c.id];
    const ward = effects.ward[c.id];
    return ac || ward ? { ...c, ...(ac ? { roundAcBonus: ac } : {}), ...(ward ? { roundWard: ward } : {}) } : c;
  });
  return { characters, encounter, effects, notes, changes, rolls, casters, surgeUsed };
}
