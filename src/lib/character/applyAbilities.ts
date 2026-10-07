import { archerRolls, clericHealTier, rogueBonusDice } from './abilities';
import { classOf } from './classes';
import { TIERS, weaponFor } from './constants';
import { rollDice } from './dice';
import { levelDamageBonus, levelForXp } from './leveling';
import { SANCTUARY_CHANGE } from './applyTags';
import { QUICK_TEMPO_EXTRA } from '@/lib/inventory/effects';
import type { Character } from './types';

export interface AbilityAction {
  playerId?: string;
  useAbility?: boolean;
  abilityTargetId?: string | null;
  /** K2: which ability; absent or the class id = the class's main ability. */
  abilityId?: string | null;
  useItemId?: string | null;
}

export interface AbilityResult {
  characters: Character[];
  /** Outcome for the DM, keyed by the acting player; narration must match it. */
  notes: Record<string, string>;
  /** Replacement damage for the acting player's action (archer and rogue), keyed by player. */
  damage: Record<string, number>;
  /** Protected ally id -> the warrior guarding them this round. */
  guards: Record<string, string>;
  /** Players whose ability worked, so their cooldown starts. */
  used: string[];
  /** K2: the same, with the ability id (the class id for the main ability). */
  usedAbilities: { playerId: string; abilityId: string }[];
  /** Thai lines for the game log. */
  changes: string[];
}

/**
 * K2: cooldown left on one ability. The class's main ability (id = class id) lives in the legacy
 * `abilityCooldown` field unless the map has an entry for it; every other id lives in the map.
 */
export function cooldownOf(c: Character, abilityId: string): number {
  const mapped = c.abilityCooldowns?.[abilityId];
  if (mapped !== undefined) return mapped;
  return abilityId === c.classId ? (c.abilityCooldown ?? 0) : 0;
}

/**
 * Resolves this round's ability actions before narration. Pure: an attempt that fails any check
 * (no class, downed, cooling down, bad target) changes nothing and only leaves a note for the DM.
 */
export function applyAbilityActions(
  characters: Character[],
  actions: AbilityAction[],
  rollDie: (sides: number) => number
): AbilityResult {
  const next = characters.map((c) => ({ ...c }));
  const notes: Record<string, string> = {};
  const damage: Record<string, number> = {};
  const guards: Record<string, string> = {};
  const used: string[] = [];
  const usedAbilities: { playerId: string; abilityId: string }[] = [];
  const changes: string[] = [];

  for (const action of actions) {
    // A potion and an ability are two different actions; the potion already resolved.
    if (!action.useAbility || !action.playerId || action.useItemId) continue;
    const user = next.find((c) => c.id === action.playerId);
    if (!user) continue;
    const cls = classOf(user.classId);
    // K4: the mage's main ability (arcane surge) rides on a spell cast and is resolved with it (applySpellActions).
    if (cls?.id === 'mage') continue;
    const fail = (reason = 'it was not ready') => {
      notes[user.id] = `tried to use ${cls ? cls.ability.nameTh : 'a class ability'} but ${reason}`;
    };
    // K2: only the class's main ability (id = class id) is defined so far; any other id is refused.
    const abilityId = action.abilityId || cls?.id;
    if (!cls || user.status !== 'active' || abilityId !== cls.id || cooldownOf(user, cls.id) > 0) {
      fail();
      continue;
    }

    const { ability } = cls;
    let target: Character | undefined;
    if (ability.target) {
      target = next.find((c) => c.id === action.abilityTargetId);
      if (!target || target.status !== 'active' || (ability.target === 'ally' && target.id === user.id)) {
        fail();
        continue;
      }
    }

    const level = levelForXp(user.xp ?? 0);
    const weapon = weaponFor(user.weaponId);
    if (cls.id === 'warrior' && target) {
      // Only one guard per ally; the later warrior keeps their cooldown.
      if (target.id in guards) {
        const guardian = next.find((c) => c.id === guards[target.id]);
        fail(`${guardian?.displayName ?? 'someone'} is already shielding ${target.displayName}`);
        continue;
      }
      guards[target.id] = user.id;
      notes[user.id] = `used ${ability.nameTh} to shield ${target.displayName} this round`;
      changes.push(`${user.displayName} ใช้${ability.nameTh} ปกป้อง ${target.displayName}`);
    } else if (cls.id === 'cleric' && target) {
      if (target.hp >= target.maxHp) {
        fail(`${target.displayName} is not hurt`);
        continue;
      }
      const gained = Math.min(target.maxHp - target.hp, rollDice(TIERS[clericHealTier(level)], rollDie));
      target.hp += gained;
      notes[user.id] = `used ${ability.nameTh} on ${target.displayName} and restored ${gained} HP`;
      changes.push(
        target.id === user.id
          ? `${user.displayName} ใช้${ability.nameTh} (+${gained} HP)`
          : `${user.displayName} ใช้${ability.nameTh} ให้ ${target.displayName} (+${gained} HP)`
      );
    } else {
      let total = levelDamageBonus(level);
      if (cls.id === 'archer') {
        for (let i = 0; i < archerRolls(level); i++) total += rollDice(weapon.dice, rollDie);
      } else {
        total += rollDice(weapon.dice, rollDie) + rollDice(rogueBonusDice(level), rollDie);
      }
      damage[user.id] = total;
      notes[user.id] = `used ${ability.nameTh}: damage roll ${total}`;
      changes.push(`${user.displayName} ใช้${ability.nameTh}`);
    }
    used.push(user.id);
    usedAbilities.push({ playerId: user.id, abilityId: cls.id });
  }

  return { characters: next, notes, damage, guards, used, usedAbilities, changes };
}

/**
 * A round "counts" for cooldowns only if the narration's tags actually changed something: the log
 * lines each tag-driven system produced (a sanctuary on its own does not count). A misspelled
 * name, an unknown item or a downed target therefore never refreshes anyone's cooldown.
 */
export function eventfulRound(changes: { character: string[]; inventory: string[]; economy: string[]; xp: string[] }): boolean {
  return (
    changes.character.some((line) => line !== SANCTUARY_CHANGE) ||
    changes.inventory.length > 0 ||
    changes.economy.length > 0 ||
    changes.xp.length > 0
  );
}

/**
 * Cooldown bookkeeping after a round's tags: on an eventful round everyone's cooldown drops by one,
 * then players who used their ability this round start the full cooldown (so the round of use
 * never counts toward its own cooldown). F5j7 quick_tempo: a wearer's tick drops by QUICK_TEMPO_EXTRA more (floor 0).
 * K2: the per-ability map ticks the same way; `usedExtra` lists other abilities used this round with
 * their own full cooldown. A character gets a map only if it already had one or just used an extra ability.
 */
export function tickCooldowns(
  characters: Character[],
  eventful: boolean,
  used: string[],
  usedExtra: { playerId: string; abilityId: string; cooldown: number }[] = [],
  /** K4 quicken_rhythm: playerId -> rounds taken off every cooldown still running, after this round's tick (floor 0). */
  cooldownCut: Record<string, number> = {}
): Character[] {
  const ticked = characters.map((c) => {
    const drop = 1 + (c.itemEffects?.effects.includes('quick_tempo') ? QUICK_TEMPO_EXTRA : 0);
    let cooldown = c.abilityCooldown ?? 0;
    if (eventful) cooldown = Math.max(0, cooldown - drop);
    const cls = classOf(c.classId);
    if (cls && used.includes(c.id)) cooldown = cls.ability.cooldown;
    const mine = usedExtra.filter((u) => u.playerId === c.id);
    if (!c.abilityCooldowns && mine.length === 0) return { ...c, abilityCooldown: cooldown };
    const map: Record<string, number> = {};
    for (const [id, left] of Object.entries(c.abilityCooldowns ?? {})) {
      const next = eventful ? Math.max(0, left - drop) : left;
      if (next > 0) map[id] = next;
    }
    for (const u of mine) if (u.cooldown > 0) map[u.abilityId] = u.cooldown;
    return { ...c, abilityCooldown: cooldown, abilityCooldowns: map };
  });
  return ticked.map((c) => {
    const cut = cooldownCut[c.id] ?? 0;
    if (cut <= 0) return c;
    const map: Record<string, number> = {};
    for (const [id, left] of Object.entries(c.abilityCooldowns ?? {})) if (left - cut > 0) map[id] = left - cut;
    return { ...c, abilityCooldown: Math.max(0, (c.abilityCooldown ?? 0) - cut), ...(c.abilityCooldowns ? { abilityCooldowns: map } : {}) };
  });
}
