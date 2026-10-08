/**
 * K5: subclasses (chosen once at level 3) and the three abilities that replace a class's main one.
 * Data from docs/class-options-draft.md section 5. The effects are applied by applyAbilities.ts (abilities,
 * saves), combat/attack.ts (attack modifiers), spells.ts / applySpells.ts (mage) and classes.ts (expertise).
 */
import { abilityModifier, normalizeAbilities, type AbilityKey } from './constants';
import { proficiencyBonus, type ClassId, type SkillId } from './classes';
import { levelForXp } from './leveling';
import type { Character } from './types';
import type { EnemyTier } from './tags';
import { hasPick } from './abilityPicks';
import { FREQUENT_SURGE_COOLDOWN } from './abilityPickConstants';
import {
  BERSERK_COOLDOWN, FEINT_COOLDOWN, GUARDIAN_COOLDOWN, LIFE_COOLDOWN, TRICKSTER_EXPERTISE_SKILLS, VOLLEY_COOLDOWN,
} from './subclassConstants';

export const SUBCLASS_IDS = [
  'warrior_guardian', 'warrior_berserker', 'archer_hunter', 'archer_skirmisher', 'cleric_life',
  'cleric_radiant', 'rogue_assassin', 'rogue_trickster', 'mage_evoker', 'mage_warder',
] as const;
export type SubclassId = (typeof SUBCLASS_IDS)[number];

export const REPLACEMENT_ABILITY_IDS = ['berserk_strike', 'volley', 'feint'] as const;
export type ReplacementAbilityId = (typeof REPLACEMENT_ABILITY_IDS)[number];

export interface SubclassDef {
  id: SubclassId;
  classId: ClassId;
  nameTh: string;
  descTh: string;
  /** The ability this subclass puts in place of the class's main one, if any. */
  replacesMain?: ReplacementAbilityId;
}

export interface ReplacementAbilityDef {
  id: ReplacementAbilityId;
  nameTh: string;
  descTh: string;
  /** 'enemy' = one live enemy named in the action's target; null = nobody to pick. */
  target: 'enemy' | null;
  cooldown: number;
  /** True when the ability stands in for the player's weapon attack this round. */
  replacesAttack: boolean;
}

export const REPLACEMENT_ABILITIES: Record<ReplacementAbilityId, ReplacementAbilityDef> = {
  berserk_strike: {
    id: 'berserk_strike', nameTh: 'ฟันคลั่ง', cooldown: BERSERK_COOLDOWN, target: null, replacesAttack: true,
    descTh: 'โจมตีแบบ advantage โดนลด 2 pip (ทอยได้ 20 ลด 3 pip) แต่ AC ลดลง 2 ตลอดรอบ เลเวล 5 ขึ้นไปฟื้น 2 HP เมื่อฟันศัตรูจนหมด pip',
  },
  volley: {
    id: 'volley', nameTh: 'ยิงกระหน่ำ', cooldown: VOLLEY_COOLDOWN, target: null, replacesAttack: true,
    descTh: 'ยิง 2 ลูก (เลเวล 5 ยิง 3 ลูก) ทอยโจมตีแยกกัน ลูกถัดไปไปที่ศัตรูตัวถัดไป โดนลูกละ 1 pip',
  },
  feint: {
    id: 'feint', nameTh: 'หลอกล่อ', cooldown: FEINT_COOLDOWN, target: 'enemy', replacesAttack: false,
    descTh: 'ศัตรู 1 ตัวทอยเซฟ ไม่ผ่านจะมึนงงและถูกเปิดช่องโหว่ ผ่านแล้วยังถูกเปิดช่องโหว่ (เพื่อนทุกคนโจมตีแบบ advantage) และโจรได้ AC +2 ตลอดรอบ',
  },
};

export const SUBCLASSES: Record<SubclassId, SubclassDef> = {
  warrior_guardian: { id: 'warrior_guardian', classId: 'warrior', nameTh: 'ผู้พิทักษ์', descTh: 'ยืนบังเร็วขึ้น (cooldown 2) และตัวนักรบได้ AC +2 ในรอบที่ยืนบัง' },
  warrior_berserker: { id: 'warrior_berserker', classId: 'warrior', nameTh: 'นักรบคลั่ง', descTh: 'แทนที่ยืนบังด้วยท่าฟันคลั่ง: โจมตีแรง advantage แลกกับ AC ที่ลดลง', replacesMain: 'berserk_strike' },
  archer_hunter: { id: 'archer_hunter', classId: 'archer', nameTh: 'นักล่า', descTh: 'ยิงโดนศัตรูระดับ strong/boss ง่ายขึ้น (AC ต่ำลง 2) และยิงแม่นยำใส่ศัตรูเหล่านั้นลด pip เพิ่ม 1' },
  archer_skirmisher: { id: 'archer_skirmisher', classId: 'archer', nameTh: 'พลธนูกระหน่ำ', descTh: 'แทนที่ยิงแม่นยำด้วยท่ายิงกระหน่ำ: ยิงหลายลูกไปหลายเป้า', replacesMain: 'volley' },
  cleric_life: { id: 'cleric_life', classId: 'cleric', nameTh: 'สายชีวิต', descTh: 'อวยพรรักษาฟื้น HP เพิ่ม 2 และ cooldown เหลือ 2' },
  cleric_radiant: { id: 'cleric_radiant', classId: 'cleric', nameTh: 'สายแสงเจิดจ้า', descTh: 'อวยพรรักษาฟื้น HP น้อยลงหนึ่งขั้น แต่แสงทำให้ศัตรูทุกตัวที่ไม่ผ่านเซฟมึนงงในรอบนั้น' },
  rogue_assassin: { id: 'rogue_assassin', classId: 'rogue', nameTh: 'นักลอบสังหาร', descTh: 'ลอบโจมตีทอยแบบ advantage เสมอ และลด pip เพิ่ม 1 เมื่อศัตรูยังมี pip เต็ม' },
  rogue_trickster: { id: 'rogue_trickster', classId: 'rogue', nameTh: 'จอมเล่ห์', descTh: 'แทนที่ลอบโจมตีด้วยท่าหลอกล่อ และชำนาญเป็นสองเท่าในการลอบ หลอกลวง และล้วงกระเป๋า', replacesMain: 'feint' },
  mage_evoker: { id: 'mage_evoker', classId: 'mage', nameTh: 'สายทำลายล้าง', descTh: 'DC เซฟของเวท +1 และเวทแรกของรอบที่ลด pip ลดเพิ่มอีก 1' },
  mage_warder: { id: 'mage_warder', classId: 'mage', nameTh: 'สายผนึกเวท', descTh: 'โล่เวทและกำบังเวทแรงขึ้น ตรึงร่าง/หมอกมายา DC +2 และเวทป้องกัน/สนับสนุนที่ใช้กับตัวเองครั้งแรกของรอบไม่เสียช่อง' },
};

export function isSubclassId(value: unknown): value is SubclassId {
  return typeof value === 'string' && (SUBCLASS_IDS as readonly string[]).includes(value);
}

export function isReplacementAbilityId(value: unknown): value is ReplacementAbilityId {
  return typeof value === 'string' && (REPLACEMENT_ABILITY_IDS as readonly string[]).includes(value);
}

/** The subclasses a class can choose from. */
export function subclassesFor(classId: string | null | undefined): SubclassDef[] {
  return SUBCLASS_IDS.map((id) => SUBCLASSES[id]).filter((s) => s.classId === classId);
}

/** The character's subclass, or null (none chosen, unknown id, or one that belongs to another class). */
export function subclassOf(c: Pick<Character, 'classId' | 'subclassId'>): SubclassDef | null {
  if (!isSubclassId(c.subclassId)) return null;
  const def = SUBCLASSES[c.subclassId];
  return def.classId === c.classId ? def : null;
}

export const hasSubclass = (c: Pick<Character, 'classId' | 'subclassId'>, id: SubclassId): boolean => subclassOf(c)?.id === id;

/** The ability that stands in for the class's main ability: a replacement, or null when the class keeps its own. */
export function replacementOf(c: Pick<Character, 'classId' | 'subclassId'>): ReplacementAbilityDef | null {
  const id = subclassOf(c)?.replacesMain;
  return id ? REPLACEMENT_ABILITIES[id] : null;
}

/** Cooldown the main ability starts with after a use: guardian and life shorten it. */
export function mainCooldownFor(c: Pick<Character, 'classId' | 'subclassId'> & { abilityPicks?: Record<string, string> | null }, classCooldown: number): number {
  // K6 mage_frequent_surge: the arcane surge comes back faster.
  if (hasPick(c, 'mage_frequent_surge')) return FREQUENT_SURGE_COOLDOWN;
  const sub = subclassOf(c)?.id;
  if (sub === 'warrior_guardian') return GUARDIAN_COOLDOWN;
  if (sub === 'cleric_life') return LIFE_COOLDOWN;
  return classCooldown;
}

/** True when the character's subclass doubles the proficiency bonus on this skill (rogue_trickster). */
export const hasExpertise = (c: Pick<Character, 'classId' | 'subclassId'>, skill: SkillId): boolean =>
  hasSubclass(c, 'rogue_trickster') && TRICKSTER_EXPERTISE_SKILLS.includes(skill);

/** Save DC of an ability that makes enemies save: 8 + proficiency + the ability's modifier. */
export function abilitySaveDc(c: Character, key: AbilityKey): number {
  return 8 + proficiencyBonus(levelForXp(c.xp ?? 0)) + abilityModifier(normalizeAbilities(c.abilities)[key]);
}

/** Per-attack changes a class ability or subclass makes to this round's weapon attack (see runAttacks). */
export interface AttackMods {
  /** The attack roll has advantage. */
  advantage?: boolean;
  /** A hit removes at least this many pips. */
  minPips?: number;
  /** A natural 20 removes at least this many pips. */
  critPips?: number;
  /** A hit on one of these tiers removes this many pips more. */
  extraPipsVs?: { tiers: EnemyTier[]; pips: number };
  /** A hit on an enemy that still has all its pips removes this many pips more. */
  extraPipIfFull?: number;
  /** Volley: this many separate shots (first at the chosen target, the rest at the next live enemies), 1 pip per hit. */
  shots?: number;
  /** An enemy this attack defeats heals the attacker this much. */
  healOnDefeat?: number;
  /** K6 sweep: this many separate swings (the chosen enemy and the next live ones), each with the weapon damage. */
  spread?: number;
  /** K6 piercing arrow: the enemy's armored / nimble AC bonus does not count. */
  ignoreTraitAc?: boolean;
  /** K6 smite: the attack is made with this ability's modifier instead of the weapon's. */
  attackAbility?: AbilityKey;
}
