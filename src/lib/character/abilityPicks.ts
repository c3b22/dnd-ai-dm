/**
 * K6: the two abilities a character picks at level 6 and at level 9 (one of two each time).
 * Data from docs/class-options-draft.md section 6. A pick is stored in players.ability_picks as
 * { "6": "<id>", "9": "<id>" } (Character.abilityPicks). Passive picks are read where they apply (armorClass,
 * combat/attack.ts, spells.ts, subclasses.ts); active picks are resolved by pickAbilities.ts (called from
 * applyAbilities.ts) and keep their own cooldown in the per-ability map (K2). This module imports nothing from
 * the rest of the game so any of them can use it.
 */
import type { ClassId } from './classes';
import {
  BLOOD_RUSH_HEAL, CHAIN_SHOT_PIPS, DEEP_RESERVE_SLOTS, FREQUENT_SURGE_COOLDOWN, HAWK_EYE_BONUS, MASS_HEAL_COOLDOWN, METEOR_COOLDOWN,
  METEOR_PIPS, PICK_LEVELS, PIERCING_COOLDOWN, RECOVER_COOLDOWN, RECOVER_SLOTS, SHADOW_STEP_COOLDOWN, SMITE_COOLDOWN,
  SMOKE_VEIL_COOLDOWN, SNARE_COOLDOWN, STONE_SKIN_AC, SWEEP_COOLDOWN, SWEEP_TARGETS, WAR_CRY_COOLDOWN, WARD_PRAYER_AC,
  WARD_PRAYER_COOLDOWN, WOUND_READER_BONUS,
} from './abilityPickConstants';

export type PickLevel = (typeof PICK_LEVELS)[number];

export const PICK_ABILITY_IDS = [
  'warrior_stone_skin', 'warrior_war_cry', 'warrior_blood_rush', 'warrior_sweep',
  'archer_hawk_eye', 'archer_snare', 'archer_piercing_arrow', 'archer_chain_shot',
  'cleric_ward_prayer', 'cleric_twin_spark', 'cleric_mass_heal', 'cleric_smite',
  'rogue_smoke_veil', 'rogue_wound_reader', 'rogue_evasion', 'rogue_shadow_step',
  'mage_deep_reserve', 'mage_recover', 'mage_meteor', 'mage_frequent_surge',
] as const;
export type PickAbilityId = (typeof PICK_ABILITY_IDS)[number];

export interface PickAbilityDef {
  id: PickAbilityId;
  classId: ClassId;
  level: PickLevel;
  nameTh: string;
  descTh: string;
  kind: 'passive' | 'active';
  /** Cooldown an active ability starts with after a use; 0 for a passive. */
  cooldown: number;
  /** 'enemy' = one live enemy named in the action's target; null = nobody to pick. */
  target: 'enemy' | null;
  /** True when the ability changes this round's weapon attack (it only works if the player also attacks). */
  modifiesAttack: boolean;
}

const def = (
  id: PickAbilityId, classId: ClassId, level: PickLevel, nameTh: string, descTh: string,
  kind: 'passive' | 'active', cooldown = 0, extra: { target?: 'enemy'; modifiesAttack?: boolean } = {}
): PickAbilityDef => ({ id, classId, level, nameTh, descTh, kind, cooldown, target: extra.target ?? null, modifiesAttack: extra.modifiesAttack ?? false });

export const PICK_ABILITIES: Record<PickAbilityId, PickAbilityDef> = {
  warrior_stone_skin: def('warrior_stone_skin', 'warrior', 6, 'ผิวหินผา', `AC +${STONE_SKIN_AC} ถาวร`, 'passive'),
  warrior_war_cry: def('warrior_war_cry', 'warrior', 6, 'เสียงคำราม', 'ศัตรูทุกตัวที่ยังสู้ได้ (สูงสุด 6) ทอยเซฟ ไม่ผ่านจะมึนงงในรอบนี้', 'active', WAR_CRY_COOLDOWN),
  warrior_blood_rush: def('warrior_blood_rush', 'warrior', 9, 'กระแสเลือด', `เมื่อโจมตีแล้วศัตรูเสีย pip จริง ฟื้น ${BLOOD_RUSH_HEAL} HP (ครั้งเดียวต่อรอบ)`, 'passive'),
  warrior_sweep: def('warrior_sweep', 'warrior', 9, 'ฟันกวาด', `โจมตีศัตรู ${SWEEP_TARGETS} ตัว (เป้าหลักกับตัวถัดไป) ทอยโจมตีแยกกัน`, 'active', SWEEP_COOLDOWN, { modifiesAttack: true }),
  archer_hawk_eye: def('archer_hawk_eye', 'archer', 6, 'ตาเหยี่ยว', `โบนัสทอยโจมตีทุกครั้ง +${HAWK_EYE_BONUS}`, 'passive'),
  archer_snare: def('archer_snare', 'archer', 6, 'กับดักเชือก', 'ศัตรู 1 ตัวทอยเซฟ ไม่ผ่านจะถูกตรึงไม่โจมตีรอบนี้ (บอสแค่มึนงง)', 'active', SNARE_COOLDOWN, { target: 'enemy' }),
  archer_piercing_arrow: def('archer_piercing_arrow', 'archer', 9, 'ลูกศรทะลวง', 'โจมตีแบบ advantage โดนลด 2 pip (ทอยได้ 20 ลด 3 pip) และไม่นับ AC ที่เพิ่มจากเกราะหนา/ว่องไว', 'active', PIERCING_COOLDOWN, { modifiesAttack: true }),
  archer_chain_shot: def('archer_chain_shot', 'archer', 9, 'ยิงต่อเนื่อง', `เมื่อโจมตีแล้วศัตรูหมด pip ยิงเพิ่มอีก 1 ลูกใส่ศัตรูที่เหลือ pip น้อยสุด โดนลด ${CHAIN_SHOT_PIPS} pip (ครั้งเดียวต่อรอบ)`, 'passive'),
  cleric_ward_prayer: def('cleric_ward_prayer', 'cleric', 6, 'มนตร์คุ้มกัน', `เพื่อนทุกคนที่ยังเล่นได้ (รวมนักบวช) AC +${WARD_PRAYER_AC} ตลอดรอบนี้`, 'active', WARD_PRAYER_COOLDOWN),
  cleric_twin_spark: def('cleric_twin_spark', 'cleric', 6, 'ประกายซ้ำ', 'เมื่ออวยพรรักษาเพื่อน เพื่อนที่ HP น้อยที่สุดอีกหนึ่งคนฟื้นครึ่งหนึ่งของที่ทอยได้', 'passive'),
  cleric_mass_heal: def('cleric_mass_heal', 'cleric', 9, 'รักษาหมู่', 'เพื่อนทุกคนที่ยังเล่นได้และบาดเจ็บ (ไม่รวมนักบวช) ฟื้น HP ระดับกลางแยกกัน', 'active', MASS_HEAL_COOLDOWN),
  cleric_smite: def('cleric_smite', 'cleric', 9, 'แสงทัณฑ์', 'โจมตีด้วย WIS โดนลด 2 pip (ทอยได้ 20 ลด 3 pip)', 'active', SMITE_COOLDOWN, { modifiesAttack: true }),
  rogue_smoke_veil: def('rogue_smoke_veil', 'rogue', 6, 'ม่านควัน', 'ศัตรูทุกตัวที่ยังสู้ได้มึนงงในรอบนี้โดยไม่ต้องทอยเซฟ', 'active', SMOKE_VEIL_COOLDOWN),
  rogue_wound_reader: def('rogue_wound_reader', 'rogue', 6, 'อ่านแผล', `ทอยโจมตี +${WOUND_READER_BONUS} ใส่ศัตรูที่บาดเจ็บแล้ว`, 'passive'),
  rogue_evasion: def('rogue_evasion', 'rogue', 9, 'หลบเหลี่ยม', 'การโดนโจมตีครั้งแรกของรอบ ดาเมจลดครึ่ง (ปัดขึ้น หลังหักกำบัง)', 'passive'),
  rogue_shadow_step: def('rogue_shadow_step', 'rogue', 9, 'หายตัวในเงา', 'การโจมตีของศัตรูที่เล็งโจรถูกข้ามในรอบนี้ ตัวโจรยังโจมตีได้ตามปกติ', 'active', SHADOW_STEP_COOLDOWN),
  mage_deep_reserve: def('mage_deep_reserve', 'mage', 6, 'ช่องเวทลึก', `ช่องเวทสูงสุด +${DEEP_RESERVE_SLOTS}`, 'passive'),
  mage_recover: def('mage_recover', 'mage', 6, 'คืนพลังเวท', `คืน ${RECOVER_SLOTS} ช่องเวท (ใช้ไม่ได้ถ้าช่องเต็ม) ใช้แล้วไม่ร่ายเวทในรอบนี้`, 'active', RECOVER_COOLDOWN),
  mage_meteor: def('mage_meteor', 'mage', 9, 'ดาวตกเวท', `ไม่เสียช่องเวท ใช้แทนการร่ายเวท: ศัตรูทุกตัวที่ยังสู้ได้ (สูงสุด 6) ทอยเซฟ ไม่ผ่านลด ${METEOR_PIPS} pip`, 'active', METEOR_COOLDOWN),
  mage_frequent_surge: def('mage_frequent_surge', 'mage', 9, 'ไหลล้นถี่', `เวทไหลล้น cooldown เหลือ ${FREQUENT_SURGE_COOLDOWN}`, 'passive'),
};

export function isPickAbilityId(value: unknown): value is PickAbilityId {
  return typeof value === 'string' && (PICK_ABILITY_IDS as readonly string[]).includes(value);
}

export function isPickLevel(value: unknown): value is PickLevel {
  return typeof value === 'number' && (PICK_LEVELS as readonly number[]).includes(value);
}

/** The two abilities a class can pick from at this level. */
export function picksFor(classId: string | null | undefined, level: number): PickAbilityDef[] {
  return PICK_ABILITY_IDS.map((id) => PICK_ABILITIES[id]).filter((p) => p.classId === classId && p.level === level);
}

type PickHolder = { classId?: string | null; abilityPicks?: Record<string, string> | null };

/** The abilities this character really has: stored picks that exist, belong to the class and sit at their own level. */
export function picksOf(c: PickHolder): PickAbilityDef[] {
  return PICK_LEVELS.flatMap((level) => {
    const id = c.abilityPicks?.[String(level)];
    if (!isPickAbilityId(id)) return [];
    const p = PICK_ABILITIES[id];
    return p.classId === c.classId && p.level === level ? [p] : [];
  });
}

export const hasPick = (c: PickHolder, id: PickAbilityId): boolean => picksOf(c).some((p) => p.id === id);
