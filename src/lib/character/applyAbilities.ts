import { archerRolls, clericHealTier, rogueBonusDice } from './abilities';
import { classOf } from './classes';
import { TIERS, weaponFor } from './constants';
import { rollDice } from './dice';
import { levelDamageBonus, levelForXp } from './leveling';
import type { Character } from './types';

export interface AbilityAction {
  playerId?: string;
  useAbility?: boolean;
  abilityTargetId?: string | null;
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
  /** Thai lines for the game log. */
  changes: string[];
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
  const changes: string[] = [];

  for (const action of actions) {
    // A potion and an ability are two different actions; the potion already resolved.
    if (!action.useAbility || !action.playerId || action.useItemId) continue;
    const user = next.find((c) => c.id === action.playerId);
    if (!user) continue;
    const cls = classOf(user.classId);
    const fail = () => {
      notes[user.id] = `tried to use ${cls ? cls.ability.nameTh : 'a class ability'} but it was not ready`;
    };
    if (!cls || user.status !== 'active' || (user.abilityCooldown ?? 0) > 0) {
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
      if (!(target.id in guards)) guards[target.id] = user.id;
      notes[user.id] = `used ${ability.nameTh} to shield ${target.displayName} this round`;
      changes.push(`${user.displayName} ใช้${ability.nameTh} ปกป้อง ${target.displayName}`);
    } else if (cls.id === 'cleric' && target) {
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
  }

  return { characters: next, notes, damage, guards, used, changes };
}
