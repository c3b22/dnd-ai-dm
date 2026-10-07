/**
 * K3: the mage's spells (data + pure resolution) and spell slot accounting. See docs/class-options-draft.md.
 *
 * Slots are stored as `players.spell_slots_used` (Character.spellSlotsUsed); what is left is always
 * `MAGE_SPELL_SLOTS[level] - used`, so a level-up raises the remaining count by itself and a rest only has
 * to lower `used`. The caller (K4) supplies the dice (`d20`) and applies the returned pip changes, statuses
 * and one-round effects; nothing here touches a database.
 */
import { abilityModifier, normalizeAbilities } from './constants';
import { proficiencyBonus, type SkillId } from './classes';
import { levelForXp } from './leveling';
import type { Character } from './types';
import { resolveAttack, traitAcBonus } from '@/lib/combat/attack';
import { ENEMY_SAVE_BONUS } from '@/lib/combat/constants';
import { damageEnemy, findActiveEnemy, type Encounter, type EncounterEnemy } from '@/lib/combat/encounter';
import type { EnemyTier } from './tags';
import type { Advantage } from './check';
import type { SpellSlots } from './rest';
import {
  ALL_TONGUES_SKILLS, ARCANE_BOLT_PIPS, ARCANE_SHIELD_AC, ARCANE_SHIELD_AC_HI, ARCANE_SHIELD_HI_LEVEL, ARCANE_SIGHT_SKILLS,
  CANTRIP_SCALE_LEVELS, FIRE_BURST_PIPS, FIRE_BURST_PIPS_HI, FROST_LANCE_PIPS, FROST_LANCE_PIPS_HI, MAGE_SPELL_SLOTS,
  QUICKEN_COOLDOWN_CUT, SCATTER_SPARK_BASE_TARGETS, SCATTER_SPARK_PIPS, SPELL_AOE_MAX_TARGETS, SPELL_CRIT_EXTRA_PIPS,
  SPELL_HIGH_LEVEL, SPELL_SAVE_DC_BASE, SPELL_WARD, SPELL_WARD_HI, SURGE_UPGRADE_BONUS,
} from './spellConstants';
import { ABILITY_UPGRADE_LEVEL } from './abilities';

export type SpellCategory = 'attack_single' | 'attack_area' | 'defense' | 'control' | 'support' | 'explore';
export type SpellTarget = 'enemy' | 'enemies' | 'ally_or_self' | 'ally' | 'self' | 'allies';

export interface SpellDef {
  id: SpellId;
  nameTh: string;
  descTh: string;
  category: SpellCategory;
  /** 0 = cantrip (never uses a slot). */
  slots: 0 | 1;
  target: SpellTarget;
}

export const SPELL_IDS = [
  'arcane_bolt', 'frost_lance', 'scatter_spark', 'fire_burst', 'arcane_shield', 'spell_ward',
  'hold_foe', 'illusion_fog', 'valor_blessing', 'quicken_rhythm', 'arcane_sight', 'all_tongues',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];

export const SPELLS: Record<SpellId, SpellDef> = {
  arcane_bolt: { id: 'arcane_bolt', nameTh: 'แสงเวทพุ่ง', descTh: 'ยิงลูกแสงใส่ศัตรู ทอยโจมตีเทียบ AC โดนลด 1 pip (เลเวล 5 ยิง 2 ลูก, เลเวล 9 ยิง 3 ลูก)', category: 'attack_single', slots: 0, target: 'enemy' },
  frost_lance: { id: 'frost_lance', nameTh: 'หอกน้ำแข็ง', descTh: 'ทอยโจมตี โดนลด 2 pip (เลเวล 7 ลด 3 pip) และศัตรูมึนงงในรอบนี้', category: 'attack_single', slots: 1, target: 'enemy' },
  scatter_spark: { id: 'scatter_spark', nameTh: 'ประกายแตกกระจาย', descTh: 'ประกายใส่ศัตรูเป้าหมายกับตัวถัดไป 2 ตัว (เลเวล 5 ได้ 3 ตัว, เลเวล 9 ได้ 4 ตัว) ไม่ผ่านเซฟลด 1 pip', category: 'attack_area', slots: 0, target: 'enemy' },
  fire_burst: { id: 'fire_burst', nameTh: 'ลูกไฟระเบิด', descTh: 'ศัตรูทุกตัว (สูงสุด 6) ทอยเซฟ ไม่ผ่านลด 1 pip (เลเวล 7 ลด 2 pip)', category: 'attack_area', slots: 1, target: 'enemies' },
  arcane_shield: { id: 'arcane_shield', nameTh: 'โล่เวท', descTh: 'ผู้รับได้ AC +3 ตลอดรอบ (เลเวล 9 ได้ +4)', category: 'defense', slots: 1, target: 'ally_or_self' },
  spell_ward: { id: 'spell_ward', nameTh: 'กำบังเวท', descTh: 'ผู้รับลดดาเมจของการโดนครั้งแรกในรอบนี้ 3 (เลเวล 7 ลด 4)', category: 'defense', slots: 1, target: 'ally_or_self' },
  hold_foe: { id: 'hold_foe', nameTh: 'ตรึงร่าง', descTh: 'ศัตรู 1 ตัวทอยเซฟ ไม่ผ่านจะไม่โจมตีรอบนี้ (บอสแค่มึนงง)', category: 'control', slots: 1, target: 'enemy' },
  illusion_fog: { id: 'illusion_fog', nameTh: 'หมอกมายา', descTh: 'ศัตรูทุกตัว (สูงสุด 6) ทอยเซฟ ไม่ผ่านจะมึนงงในรอบนี้ (รวมบอส)', category: 'control', slots: 1, target: 'enemies' },
  valor_blessing: { id: 'valor_blessing', nameTh: 'พรกล้าหาญ', descTh: 'ผู้รับทอยโจมตีแบบ advantage ตลอดรอบนี้', category: 'support', slots: 1, target: 'ally_or_self' },
  quicken_rhythm: { id: 'quicken_rhythm', nameTh: 'เร่งจังหวะ', descTh: 'เพื่อน (ไม่ใช่ตัวเอง) ลด cooldown ทุกท่าที่เหลืออยู่ลง 2', category: 'support', slots: 1, target: 'ally' },
  arcane_sight: { id: 'arcane_sight', nameTh: 'ตาเวท', descTh: 'ตัวเองได้ advantage ในการเช็กสำรวจหนึ่งครั้ง และเห็นออร่าเวทในที่นั้น', category: 'explore', slots: 0, target: 'self' },
  all_tongues: { id: 'all_tongues', nameTh: 'เสียงทั้งปวง', descTh: 'เพื่อนทุกคนได้ advantage ในการเช็กสังคมหนึ่งครั้ง และเข้าใจทุกภาษาในรอบนี้', category: 'explore', slots: 1, target: 'allies' },
};

export function isSpellId(value: unknown): value is SpellId {
  return typeof value === 'string' && (SPELL_IDS as readonly string[]).includes(value);
}

// --- slot accounting -------------------------------------------------------------------------------------

const levelOf = (c: Character): number => levelForXp(c.xp ?? 0);

/** Slots a mage of this level has in total. */
export function mageSpellSlots(level: number): number {
  const l = Math.min(Math.max(Math.floor(Number.isFinite(level) ? level : 1), 1), 10);
  return MAGE_SPELL_SLOTS[l];
}

/** The mage's slots as the rest module wants them ({ current, max }); null for any other class. */
export function spellSlotsOf(c: Character): SpellSlots | null {
  if (c.classId !== 'mage') return null;
  const max = mageSpellSlots(levelOf(c));
  const used = Math.min(max, Math.max(0, Math.floor(c.spellSlotsUsed ?? 0)));
  return { current: max - used, max };
}

/** Stores `{ current, max }` back as `spellSlotsUsed` (used = max - current, never negative). */
export function withSpellSlots(c: Character, slots: SpellSlots): Character {
  return { ...c, spellSlotsUsed: Math.max(0, slots.max - Math.min(slots.max, Math.max(0, slots.current))) };
}

/** One slot spent. Does not check that there is one; resolveSpell does. */
export function spendSpellSlot(c: Character): Character {
  const slots = spellSlotsOf(c);
  return slots ? withSpellSlots(c, { max: slots.max, current: slots.current - 1 }) : c;
}

const intMod = (c: Character): number => abilityModifier(normalizeAbilities(c.abilities).INT);

/** Save DC of the mage's spells: 8 + proficiency + INT modifier. */
export function spellSaveDc(c: Character, bonus = 0): number {
  return SPELL_SAVE_DC_BASE + proficiencyBonus(levelOf(c)) + intMod(c) + bonus;
}

/** Attack bonus of the mage's spells: proficiency + INT modifier. */
export function spellAttackBonus(c: Character, bonus = 0): number {
  return proficiencyBonus(levelOf(c)) + intMod(c) + bonus;
}

/** An enemy's saving throw: d20 + tier bonus against the DC; nat 20 always saves, nat 1 always fails. */
export function rollEnemySave(input: { tier: EnemyTier; dc: number; die: number }): { total: number; saved: boolean; critical: 'success' | 'failure' | null } {
  const total = input.die + ENEMY_SAVE_BONUS[input.tier];
  const critical = input.die === 20 ? 'success' : input.die === 1 ? 'failure' : null;
  const saved = critical === 'success' ? true : critical === 'failure' ? false : total >= input.dc;
  return { total, saved, critical };
}

// --- one-round effects -----------------------------------------------------------------------------------

export type EnemyStatus = 'dazed' | 'stunned' | 'exposed';

/** Effects that last only for the round a spell is cast in; never stored. */
export interface RoundEffects {
  /** playerId -> AC bonus against enemy attacks. */
  acBonus: Record<string, number>;
  /** playerId -> damage reduction on the first hit taken. */
  ward: Record<string, number>;
  /** playerIds whose attack rolls have advantage. */
  advantage: Set<string>;
  /** playerId -> skills that have advantage on one check. */
  skillAdvantage: Record<string, SkillId[]>;
  /** enemy name -> statuses. */
  enemy: Record<string, EnemyStatus[]>;
  /** playerId -> how many rounds of cooldown are cut from every ability still cooling down. */
  cooldownCut: Record<string, number>;
}

export const emptyRoundEffects = (): RoundEffects => ({ acBonus: {}, ward: {}, advantage: new Set(), skillAdvantage: {}, enemy: {}, cooldownCut: {} });

// --- resolution ------------------------------------------------------------------------------------------

export type SpellRefusal = 'not_mage' | 'unknown_spell' | 'not_active' | 'no_slots' | 'no_encounter' | 'bad_target' | 'no_effect';

export interface SpellRoll {
  kind: 'attack' | 'save';
  /** Enemy name, as it is in the encounter. */
  target: string;
  tier: EnemyTier;
  die: number;
  /** Everything added to the die: the caster's attack bonus (attack) or the enemy's save bonus (save). */
  bonus: number;
  total: number;
  /** Attack: the enemy's AC. Save: the spell's DC. */
  dc: number;
  /** Attack: it hit. Save: the enemy saved (so the spell had no effect on it). */
  success: boolean;
  critical: 'success' | 'failure' | null;
  /** Pips taken off (0 when missed or saved). */
  pips: number;
}

export interface SpellResult {
  ok: boolean;
  reason?: SpellRefusal;
  spellId: string;
  /** Slots really spent (0 for a cantrip, a surge or a refusal). */
  slotCost: number;
  /** The caster with the slot spent; unchanged on a refusal. */
  caster: Character;
  /** The encounter after the spell; the input one (unchanged) on a refusal or when there was none. */
  encounter: Encounter | null;
  effects: RoundEffects;
  rolls: SpellRoll[];
  /** Thai lines for the DM to narrate faithfully (and the stats summary). */
  notes: string[];
}

export interface ResolveSpellInput {
  caster: Character;
  spellId: string;
  /** Enemy name (enemy spells) or player id / display name (ally spells). */
  target?: string;
  /** Every player of the campaign (the caster included) for ally targets. */
  allies: Character[];
  encounter: Encounter | null;
  /** The arcane_surge ability: free cast, and from level 5 attack +2 / DC +2. */
  surge?: boolean;
  /** Attack advantage (e.g. from valor_blessing); fearsome can pass 'disadvantage'. */
  advantage?: Advantage;
  /** Rolls one d20. */
  d20: () => number;
}

const isLive = (e: EncounterEnemy) => e.pip > 0 && !e.fled;
const scaleSteps = (level: number): number => CANTRIP_SCALE_LEVELS.filter((l) => level >= l).length;

function refuse(input: ResolveSpellInput, reason: SpellRefusal, note: string): SpellResult {
  return { ok: false, reason, spellId: input.spellId, slotCost: 0, caster: input.caster, encounter: input.encounter, effects: emptyRoundEffects(), rolls: [], notes: [note] };
}

function findAlly(allies: Character[], key: string | undefined): Character | undefined {
  if (!key) return undefined;
  return allies.find((c) => c.id === key) ?? allies.find((c) => c.displayName === key);
}

const coolingDown = (c: Character): boolean => (c.abilityCooldown ?? 0) > 0 || Object.values(c.abilityCooldowns ?? {}).some((n) => n > 0);

/**
 * Resolves one spell cast. Pure: clones the encounter, takes dice from `d20`, never mutates its input.
 * A refusal costs nothing (no slot, no cooldown): the caller must not start the surge cooldown either.
 */
export function resolveSpell(input: ResolveSpellInput): SpellResult {
  const { caster, allies } = input;
  const name = caster.displayName;
  if (caster.classId !== 'mage') return refuse(input, 'not_mage', `${name} ร่ายเวทไม่ได้ (ไม่ใช่นักเวท)`);
  if (!isSpellId(input.spellId)) return refuse(input, 'unknown_spell', `${name} ไม่รู้จักเวทนี้`);
  if (caster.status !== 'active') return refuse(input, 'not_active', `${name} ร่ายเวทไม่ได้ในสภาพนี้`);
  const spell = SPELLS[input.spellId];
  const level = levelOf(caster);
  const slots = spellSlotsOf(caster)!;
  const surge = input.surge === true;
  if (spell.slots > 0 && !surge && slots.current < spell.slots) {
    return refuse(input, 'no_slots', `${name} ช่องเวทหมด ร่าย${spell.nameTh}ไม่ได้ (ยังร่ายเวทพื้นฐานได้)`);
  }

  const surgeBonus = surge && level >= ABILITY_UPGRADE_LEVEL ? SURGE_UPGRADE_BONUS : 0;
  const attackBonus = spellAttackBonus(caster, surgeBonus);
  const dc = spellSaveDc(caster, surgeBonus);
  const advantage: Advantage = input.advantage ?? 'none';
  const hi = level >= SPELL_HIGH_LEVEL;
  const effects = emptyRoundEffects();
  const rolls: SpellRoll[] = [];
  const notes: string[] = [];
  const cast = surge ? `${name} ร่าย${spell.nameTh}ด้วยเวทไหลล้น (ไม่เสียช่องเวท)` : `${name} ร่าย${spell.nameTh}`;

  const finish = (encounter: Encounter | null): SpellResult => ({
    ok: true,
    spellId: spell.id,
    slotCost: surge ? 0 : spell.slots,
    caster: surge || spell.slots === 0 ? caster : spendSpellSlot(caster),
    encounter,
    effects,
    rolls,
    notes,
  });

  // ----- enemy spells -----
  if (spell.target === 'enemy' || spell.target === 'enemies') {
    if (!input.encounter) return refuse(input, 'no_encounter', `${name} ร่าย${spell.nameTh}ไม่ได้ เพราะไม่มีศัตรูอยู่ตรงหน้า`);
    const enemies = input.encounter.enemies.map((e) => ({ ...e }));
    const encounter = (): Encounter => ({ ...input.encounter!, enemies });
    const liveOnes = enemies.filter(isLive);
    const chosen = spell.target === 'enemy' ? findActiveEnemy(enemies, input.target ?? '') : undefined;
    if (spell.target === 'enemy' && !chosen) return refuse(input, 'bad_target', `${name} ต้องเลือกศัตรูที่ยังสู้อยู่เป็นเป้าหมาย`);
    if (spell.target === 'enemies' && liveOnes.length === 0) return refuse(input, 'bad_target', `ไม่มีศัตรูที่ยังสู้อยู่`);

    const attackRoll = (enemy: EncounterEnemy, pips: number) => {
      const dice = advantage === 'none' ? [input.d20()] : [input.d20(), input.d20()];
      const r = resolveAttack({ d20s: dice, advantage, tier: enemy.tier, damage: 0, maxDamage: 1, acBonus: traitAcBonus(enemy), proficiency: 0, modifier: attackBonus });
      const dealt = r.hit ? pips + (r.critical === 'success' ? SPELL_CRIT_EXTRA_PIPS : 0) : 0;
      if (dealt > 0) damageEnemy(enemy, dealt);
      rolls.push({ kind: 'attack', target: enemy.name, tier: enemy.tier, die: r.die, bonus: attackBonus, total: r.total, dc: r.dc, success: r.hit, critical: r.critical, pips: dealt });
      return { hit: r.hit, dealt, die: r.die, total: r.total, ac: r.dc };
    };
    const saveRoll = (enemy: EncounterEnemy): boolean => {
      const die = input.d20();
      const s = rollEnemySave({ tier: enemy.tier, dc, die });
      rolls.push({ kind: 'save', target: enemy.name, tier: enemy.tier, die, bonus: ENEMY_SAVE_BONUS[enemy.tier], total: s.total, dc, success: s.saved, critical: s.critical, pips: 0 });
      return s.saved;
    };
    const addStatus = (enemy: string, status: EnemyStatus) => {
      effects.enemy[enemy] = [...(effects.enemy[enemy] ?? []).filter((s) => s !== status), status];
    };
    const describe = (r: { hit: boolean; dealt: number; die: number; total: number; ac: number }, target: string) =>
      `${r.die}+${r.total - r.die} = ${r.total} เทียบ AC ${r.ac} ${r.hit ? `โดน ${target} −${r.dealt} pip` : `พลาด ${target}`}`;

    if (spell.id === 'arcane_bolt') {
      const bolts = 1 + scaleSteps(level);
      notes.push(cast);
      let target: EncounterEnemy | undefined = chosen;
      for (let i = 0; i < bolts; i++) {
        if (!target || !isLive(target)) target = enemies.filter(isLive).sort((a, b) => a.pip - b.pip)[0];
        if (!target) break;
        notes.push(`ลูกที่ ${i + 1}: ${describe(attackRoll(target, ARCANE_BOLT_PIPS), target.name)}`);
      }
      return finish(encounter());
    }
    if (spell.id === 'frost_lance') {
      const r = attackRoll(chosen!, hi ? FROST_LANCE_PIPS_HI : FROST_LANCE_PIPS);
      notes.push(`${cast}: ${describe(r, chosen!.name)}`);
      if (r.hit) {
        addStatus(chosen!.name, 'dazed');
        notes.push(`${chosen!.name} มึนงงในรอบนี้ (โจมตีแบบ disadvantage)`);
      }
      return finish(encounter());
    }
    if (spell.id === 'scatter_spark') {
      const start = enemies.indexOf(chosen!);
      const count = SCATTER_SPARK_BASE_TARGETS + scaleSteps(level);
      const hit = [chosen!, ...enemies.slice(start + 1).filter(isLive)].slice(0, count);
      notes.push(`${cast} ใส่ ${hit.map((e) => e.name).join(', ')}`);
      for (const e of hit) {
        const saved = saveRoll(e);
        if (!saved) damageEnemy(e, SCATTER_SPARK_PIPS);
        rolls[rolls.length - 1].pips = saved ? 0 : SCATTER_SPARK_PIPS;
        notes.push(`${e.name} ${saved ? 'ผ่านเซฟ ไม่เป็นอะไร' : `ไม่ผ่านเซฟ −${SCATTER_SPARK_PIPS} pip`}`);
      }
      return finish(encounter());
    }
    if (spell.id === 'fire_burst') {
      const pips = hi ? FIRE_BURST_PIPS_HI : FIRE_BURST_PIPS;
      notes.push(cast);
      for (const e of liveOnes.slice(0, SPELL_AOE_MAX_TARGETS)) {
        const saved = saveRoll(e);
        if (!saved) damageEnemy(e, pips);
        rolls[rolls.length - 1].pips = saved ? 0 : pips;
        notes.push(`${e.name} ${saved ? 'ผ่านเซฟ ไม่เป็นอะไร' : `ไม่ผ่านเซฟ −${pips} pip`}`);
      }
      return finish(encounter());
    }
    if (spell.id === 'hold_foe') {
      const saved = saveRoll(chosen!);
      notes.push(`${cast} ใส่ ${chosen!.name}: ${saved ? 'ผ่านเซฟ ไม่มีผล' : chosen!.tier === 'boss' ? 'ไม่ผ่านเซฟ บอสมึนงงในรอบนี้' : 'ไม่ผ่านเซฟ ถูกตรึง ไม่โจมตีในรอบนี้'}`);
      if (!saved) addStatus(chosen!.name, chosen!.tier === 'boss' ? 'dazed' : 'stunned');
      return finish(encounter());
    }
    // illusion_fog
    notes.push(cast);
    for (const e of liveOnes.slice(0, SPELL_AOE_MAX_TARGETS)) {
      const saved = saveRoll(e);
      if (!saved) addStatus(e.name, 'dazed');
      notes.push(`${e.name} ${saved ? 'ผ่านเซฟ ไม่เป็นอะไร' : 'ไม่ผ่านเซฟ มึนงงในรอบนี้'}`);
    }
    return finish(encounter());
  }

  // ----- self / ally spells -----
  const active = allies.filter((c) => c.status === 'active');
  if (spell.id === 'arcane_sight') {
    effects.skillAdvantage[caster.id] = [...ARCANE_SIGHT_SKILLS];
    notes.push(`${cast}: ได้ advantage ในการเช็กสำรวจหนึ่งครั้ง และเห็นออร่าเวทหรือร่องรอยเวทในที่นี้ (DM เล่าตามจริง)`);
    return finish(input.encounter);
  }
  if (spell.id === 'all_tongues') {
    const everyone = active.some((c) => c.id === caster.id) ? active : [caster, ...active];
    for (const c of everyone) effects.skillAdvantage[c.id] = [...ALL_TONGUES_SKILLS];
    notes.push(`${cast}: ทุกคนได้ advantage ในการเช็กสังคมหนึ่งครั้ง และเข้าใจทุกภาษาในรอบนี้`);
    return finish(input.encounter);
  }
  const target = spell.target === 'ally_or_self' || spell.target === 'ally' ? findAlly(allies, input.target) : undefined;
  if (!target || target.status !== 'active' || (spell.target === 'ally' && target.id === caster.id)) {
    return refuse(input, 'bad_target', `${name} ต้องเลือก${spell.target === 'ally' ? 'เพื่อน' : 'เพื่อนหรือตัวเอง'}ที่ยังเล่นได้เป็นเป้าหมาย`);
  }
  const who = target.id === caster.id ? 'ตัวเอง' : target.displayName;
  switch (spell.id) {
    case 'arcane_shield': {
      const ac = level >= ARCANE_SHIELD_HI_LEVEL ? ARCANE_SHIELD_AC_HI : ARCANE_SHIELD_AC;
      effects.acBonus[target.id] = ac;
      notes.push(`${cast} ให้ ${who}: AC +${ac} ตลอดรอบนี้`);
      break;
    }
    case 'spell_ward': {
      const ward = hi ? SPELL_WARD_HI : SPELL_WARD;
      effects.ward[target.id] = ward;
      notes.push(`${cast} ให้ ${who}: ลดดาเมจของการโดนครั้งแรกในรอบนี้ ${ward}`);
      break;
    }
    case 'valor_blessing':
      effects.advantage.add(target.id);
      notes.push(`${cast} ให้ ${who}: ทอยโจมตีแบบ advantage ตลอดรอบนี้`);
      break;
    default: {
      // quicken_rhythm: pointless (and refused, slot kept) when the friend has nothing cooling down
      if (!coolingDown(target)) return refuse(input, 'no_effect', `${target.displayName} ไม่มีท่าที่ติด cooldown ร่าย${spell.nameTh}ไปก็ไม่มีผล`);
      effects.cooldownCut[target.id] = QUICKEN_COOLDOWN_CUT;
      notes.push(`${cast} ให้ ${who}: cooldown ทุกท่าที่เหลือลดลง ${QUICKEN_COOLDOWN_CUT}`);
    }
  }
  return finish(input.encounter);
}
