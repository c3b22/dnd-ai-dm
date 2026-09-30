import {
  BASE_MAX_HP,
  MIN_MAX_HP,
  REVIVE_HP,
  REVIVE_MAX_HP_STEP,
  TIERS,
  WIPE_EXTRA_MAX_HP_PENALTY,
} from './constants';
import { rollDice } from './dice';
import { findByDisplayName } from './names';
import type { CharacterTag } from './tags';
import type { Character } from './types';

export interface ApplyResult {
  characters: Character[];
  /** Thai lines for the game log, in the order things happened. */
  changes: string[];
  wiped: boolean;
}

export function applyCharacterTags(
  characters: Character[],
  tags: CharacterTag[],
  rollDie: (sides: number) => number
): ApplyResult {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];

  // Unknown or ambiguous names resolve to null so a bad tag can never hit the wrong player.
  const find = (name: string): Character | null => findByDisplayName(next, name);

  for (const tag of tags) {
    if (tag.kind === 'sanctuary') {
      for (const c of next) {
        c.maxHp = BASE_MAX_HP;
        c.revivesSinceSanctuary = 0;
      }
      changes.push('ถึงสถานที่ปลอดภัย: max HP ของทุกคนกลับมาเต็ม');
      continue;
    }

    const target = find(tag.name);
    if (!target) continue;

    if (tag.kind === 'hurt' && target.status === 'active') {
      const rolled = rollDice(TIERS[tag.tier], rollDie);
      const damage = Math.max(1, rolled - (target.armorReduction ?? 0));
      const absorbed = rolled - damage;
      target.hp = Math.max(0, target.hp - damage);
      changes.push(`${target.displayName} −${damage} HP${absorbed > 0 ? ` (เกราะกัน ${absorbed})` : ''}`);
      if (target.hp === 0) {
        target.status = 'downed';
        changes.push(`${target.displayName} ล้มลง`);
      }
    } else if (tag.kind === 'heal' && target.status === 'active') {
      const gained = Math.min(target.maxHp - target.hp, rollDice(TIERS[tag.tier], rollDie));
      if (gained > 0) {
        target.hp += gained;
        changes.push(`${target.displayName} +${gained} HP`);
      }
    } else if (tag.kind === 'revive' && target.status === 'downed') {
      target.revivesSinceSanctuary += 1;
      const before = target.maxHp;
      target.maxHp = Math.max(MIN_MAX_HP, target.maxHp - REVIVE_MAX_HP_STEP * target.revivesSinceSanctuary);
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
      c.maxHp = Math.max(MIN_MAX_HP, c.maxHp - cost);
      c.hp = Math.ceil(c.maxHp / 2);
      c.status = 'active';
    }
    changes.push('ล้มทั้งกลุ่ม! ทุกคนฟื้นครึ่งหนึ่ง แต่ max HP ลดลงหนักและต้องแลกด้วยบทลงโทษในเรื่อง');
  }

  return { characters: next, changes, wiped };
}
