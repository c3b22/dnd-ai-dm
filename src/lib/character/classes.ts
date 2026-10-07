import { MAX_LEVEL, type AbilityKey, type AbilityScores } from './constants';

export type ClassId = 'warrior' | 'archer' | 'cleric' | 'rogue' | 'mage';
/** Who an ability needs the player to pick: another ally, an ally or themselves, or nobody. */
export type AbilityTarget = 'ally' | 'ally_or_self' | null;

export interface ClassDef {
  id: ClassId;
  nameTh: string;
  weaponId: 'shortsword' | 'shortbow' | 'staff' | 'dagger' | 'wand';
  ability: { nameTh: string; descTh: string; target: AbilityTarget; cooldown: number };
  /** Starting ability scores: the D&D standard array (15/14/13/12/10/8) ordered by what the class leans on. */
  abilities: AbilityScores;
  /** Skills the class is proficient in (adds the proficiency bonus to those checks). */
  skills: readonly SkillId[];
}

/** All 18 skills of D&D 5e, each tied to the ability it is rolled with. */
export const SKILL_ABILITIES = {
  acrobatics: 'DEX',
  animal_handling: 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  sleight_of_hand: 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
} as const satisfies Record<string, AbilityKey>;
export type SkillId = keyof typeof SKILL_ABILITIES;
export const SKILL_IDS = Object.keys(SKILL_ABILITIES) as SkillId[];

/**
 * Proficiency bonus by level, D&D 5e: +2 at levels 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17+.
 * Levels come from leveling.ts (levelForXp), which caps at MAX_LEVEL (10), so in practice +2..+4;
 * the formula is the full 5e one so it keeps working if the level cap is raised.
 */
export function proficiencyBonus(level: number): number {
  const l = Math.min(Math.max(Math.floor(Number.isFinite(level) ? level : 1), 1), Math.max(MAX_LEVEL, 20));
  return Math.floor((l - 1) / 4) + 2;
}

/** Modifier for a skill: ability modifier of its governing ability, plus proficiency bonus if proficient. */
export function skillModifier(params: {
  skill: SkillId;
  abilities: AbilityScores;
  classId: ClassId;
  level: number;
  /** Worn-accessory bonuses (F5d), added when they name this skill. */
  skillBonuses?: Partial<Record<SkillId, number>>;
  /** Complete-set bonus (X9), added to every skill once. */
  setSkillBonus?: number;
}): number {
  const mod = Math.floor((params.abilities[SKILL_ABILITIES[params.skill]] - 10) / 2);
  return mod + (CLASSES[params.classId].skills.includes(params.skill) ? proficiencyBonus(params.level) : 0) + (params.skillBonuses?.[params.skill] ?? 0) + (params.setSkillBonus ?? 0);
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    nameTh: 'นักรบ',
    weaponId: 'shortsword',
    ability: { nameTh: 'ยืนบัง', descTh: 'รับดาเมจแทนเพื่อนหนึ่งคนในรอบนี้ (ลดลงครึ่งหนึ่ง)', target: 'ally', cooldown: 3 },
    abilities: { STR: 15, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 10 },
    skills: ['athletics', 'intimidation', 'perception', 'survival'],
  },
  archer: {
    id: 'archer',
    nameTh: 'นักธนู',
    weaponId: 'shortbow',
    ability: { nameTh: 'ยิงแม่นยำ', descTh: 'ทอยดาเมจอาวุธสองครั้งรวมกัน', target: null, cooldown: 3 },
    abilities: { STR: 10, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 12 },
    skills: ['acrobatics', 'perception', 'stealth', 'survival'],
  },
  cleric: {
    id: 'cleric',
    nameTh: 'นักบวช',
    weaponId: 'staff',
    ability: { nameTh: 'อวยพรรักษา', descTh: 'ฟื้น HP ให้เพื่อนหรือตัวเอง', target: 'ally_or_self', cooldown: 3 },
    abilities: { STR: 10, DEX: 8, CON: 13, INT: 12, WIS: 15, CHA: 14 },
    skills: ['insight', 'medicine', 'persuasion', 'religion'],
  },
  rogue: {
    id: 'rogue',
    nameTh: 'โจร',
    weaponId: 'dagger',
    ability: { nameTh: 'ลอบโจมตี', descTh: 'ดาเมจอาวุธ + 2d6 ในครั้งเดียว', target: null, cooldown: 4 },
    abilities: { STR: 8, DEX: 15, CON: 13, INT: 12, WIS: 10, CHA: 14 },
    skills: ['deception', 'sleight_of_hand', 'stealth', 'investigation'],
  },
  mage: {
    id: 'mage',
    nameTh: 'นักเวท',
    weaponId: 'wand',
    ability: { nameTh: 'เวทไหลล้น', descTh: 'ร่ายเวทหนึ่งบทโดยไม่เสียช่องเวท (เลเวล 5 ขึ้นไปเวทนั้นแรงขึ้น: ทอยโจมตี +2 หรือ DC +2)', target: null, cooldown: 4 },
    abilities: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 },
    skills: ['arcana', 'history', 'investigation', 'insight'],
  },
};

export const CLASS_IDS: readonly ClassId[] = ['warrior', 'archer', 'cleric', 'rogue', 'mage'];
export const DEFAULT_CLASS_ID: ClassId = 'warrior';

export function isClassId(value: unknown): value is ClassId {
  return typeof value === 'string' && (CLASS_IDS as readonly string[]).includes(value);
}

export function classOf(id: string | null | undefined): ClassDef | null {
  return isClassId(id) ? CLASSES[id] : null;
}

/** For clients that still send only a starting weapon: the class that starts with it. */
export function classForWeapon(weaponId: string | null | undefined): ClassId {
  return CLASS_IDS.find((id) => CLASSES[id].weaponId === weaponId) ?? DEFAULT_CLASS_ID;
}

/**
 * The class a new player gets: a valid classId, else (for clients that predate classes) the class
 * that starts with the weapon they sent, else the default.
 */
export function resolveClassId(params: { classId?: unknown; weaponId?: unknown }): ClassId {
  if (isClassId(params.classId)) return params.classId;
  return classForWeapon(typeof params.weaponId === 'string' ? params.weaponId : undefined);
}

/** Starting ability scores for a class, as a fresh object safe to store. */
export function startingAbilities(classId: ClassId): AbilityScores {
  return { ...CLASSES[classId].abilities };
}
