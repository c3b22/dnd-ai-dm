import {
  BASE_MAX_HP,
  MIN_MAX_HP,
  REVIVE_HP,
  REVIVE_MAX_HP_STEP,
  TIERS,
  WIPE_EXTRA_MAX_HP_PENALTY,
} from './constants';
import { rollDice } from './dice';
import { guardDivisor } from './abilities';
import { levelForXp, levelHpBonus } from './leveling';
import { findByDisplayName } from './names';
import { takeWard } from '@/lib/inventory/effects';
import type { CharacterTag } from './tags';
import type { Character } from './types';

/** The log line a sanctuary tag adds; round processing ignores it when judging whether a round was eventful. */
export const SANCTUARY_CHANGE = 'ถึงสถานที่ปลอดภัย: max HP ของทุกคนกลับมาเต็ม';

export interface ApplyResult {
  characters: Character[];
  /** Thai lines for the game log, in the order things happened. */
  changes: string[];
  wiped: boolean;
}

/** max HP the character gets from level alone; players.max_hp stays the revive-adjusted base. */
const bonusOf = (c: Character): number => levelHpBonus(levelForXp(c.xp ?? 0));

export function applyCharacterTags(
  characters: Character[],
  tags: CharacterTag[],
  rollDie: (sides: number) => number,
  /** Protected ally id -> the warrior guarding them this round (see applyAbilityActions). */
  guards: Record<string, string> = {},
  /** F5j4 ward: ids of wearers whose ward is already spent this round; shared with applyEnemyAttacks. */
  wardUsed: Set<string> = new Set()
): ApplyResult {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];

  // Unknown or ambiguous names resolve to null so a bad tag can never hit the wrong player.
  const find = (name: string): Character | null => findByDisplayName(next, name);

  for (const tag of tags) {
    if (tag.kind === 'sanctuary') {
      for (const c of next) {
        c.maxHp = BASE_MAX_HP + bonusOf(c);
        c.revivesSinceSanctuary = 0;
      }
      changes.push(SANCTUARY_CHANGE);
      continue;
    }

    if (tag.kind !== 'hurt' && tag.kind !== 'heal' && tag.kind !== 'revive') continue;
    const target = find(tag.name);
    if (!target) continue;

    if (tag.kind === 'hurt' && target.status === 'active') {
      const rolled = rollDice(TIERS[tag.tier], rollDie);
      const guard = guards[target.id] ? next.find((c) => c.id === guards[target.id]) : undefined;
      if (guard && guard.status === 'active' && guard.id !== target.id) {
        // The warrior's armor applies, not the protected ally's.
        const damage = Math.max(1, Math.ceil((rolled - (guard.armorReduction ?? 0) - takeWard(guard, wardUsed)) / guardDivisor(levelForXp(guard.xp ?? 0))));
        guard.hp = Math.max(0, guard.hp - damage);
        changes.push(`${guard.displayName} รับดาเมจแทน ${target.displayName} −${damage} HP`);
        if (guard.hp === 0) {
          guard.status = 'downed';
          changes.push(`${guard.displayName} ล้มลง`);
        }
      } else {
        const damage = Math.max(1, rolled - (target.armorReduction ?? 0) - takeWard(target, wardUsed));
        const absorbed = rolled - damage;
        target.hp = Math.max(0, target.hp - damage);
        changes.push(`${target.displayName} −${damage} HP${absorbed > 0 ? ` (เกราะกัน ${absorbed})` : ''}`);
        if (target.hp === 0) {
          target.status = 'downed';
          changes.push(`${target.displayName} ล้มลง`);
        }
      }
    } else if (tag.kind === 'heal' && target.status === 'active') {
      const gained =
        tag.tier === 'full'
          ? target.maxHp - target.hp
          : Math.min(target.maxHp - target.hp, rollDice(TIERS[tag.tier], rollDie));
      if (gained > 0) {
        target.hp += gained;
        changes.push(`${target.displayName} +${gained} HP${tag.tier === 'full' ? ' (รักษาจนเต็ม)' : ''}`);
      }
    } else if (tag.kind === 'revive' && target.status === 'downed') {
      target.revivesSinceSanctuary += 1;
      const before = target.maxHp;
      target.maxHp = Math.max(MIN_MAX_HP + bonusOf(target), target.maxHp - REVIVE_MAX_HP_STEP * target.revivesSinceSanctuary);
      target.hp = Math.min(REVIVE_HP, target.maxHp);
      target.status = 'active';
      const lost = before - target.maxHp;
      changes.push(`${target.displayName} ฟื้นขึ้นมา${lost > 0 ? ` (max HP −${lost})` : ''}`);
    }
  }

  const wiped = next.length > 0 && next.every((c) => c.status === 'downed');
  if (wiped) {
    for (const c of next) {
      c.revivesSinceSanctuary += 1;
      const cost = REVIVE_MAX_HP_STEP * c.revivesSinceSanctuary + WIPE_EXTRA_MAX_HP_PENALTY;
      c.maxHp = Math.max(MIN_MAX_HP + bonusOf(c), c.maxHp - cost);
      c.hp = Math.ceil(c.maxHp / 2);
      c.status = 'active';
    }
    changes.push('ล้มทั้งกลุ่ม! ทุกคนฟื้นครึ่งหนึ่ง แต่ max HP ลดลงหนักและต้องแลกด้วยบทลงโทษในเรื่อง');
  }

  return { characters: next, changes, wiped };
}
