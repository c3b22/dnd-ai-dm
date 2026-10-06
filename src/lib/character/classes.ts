export type ClassId = 'warrior' | 'archer' | 'cleric' | 'rogue';
/** Who an ability needs the player to pick: another ally, an ally or themselves, or nobody. */
export type AbilityTarget = 'ally' | 'ally_or_self' | null;

export interface ClassDef {
  id: ClassId;
  nameTh: string;
  weaponId: 'shortsword' | 'shortbow' | 'staff' | 'dagger';
  ability: { nameTh: string; descTh: string; target: AbilityTarget; cooldown: number };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    nameTh: 'นักรบ',
    weaponId: 'shortsword',
    ability: { nameTh: 'ยืนบัง', descTh: 'รับดาเมจแทนเพื่อนหนึ่งคนในรอบนี้ (ลดลงครึ่งหนึ่ง)', target: 'ally', cooldown: 3 },
  },
  archer: {
    id: 'archer',
    nameTh: 'นักธนู',
    weaponId: 'shortbow',
    ability: { nameTh: 'ยิงแม่นยำ', descTh: 'ทอยดาเมจอาวุธสองครั้งรวมกัน', target: null, cooldown: 3 },
  },
  cleric: {
    id: 'cleric',
    nameTh: 'นักบวช',
    weaponId: 'staff',
    ability: { nameTh: 'อวยพรรักษา', descTh: 'ฟื้น HP ให้เพื่อนหรือตัวเอง', target: 'ally_or_self', cooldown: 3 },
  },
  rogue: {
    id: 'rogue',
    nameTh: 'โจร',
    weaponId: 'dagger',
    ability: { nameTh: 'ลอบโจมตี', descTh: 'ดาเมจอาวุธ + 2d6 ในครั้งเดียว', target: null, cooldown: 4 },
  },
};

export const CLASS_IDS: readonly ClassId[] = ['warrior', 'archer', 'cleric', 'rogue'];
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
