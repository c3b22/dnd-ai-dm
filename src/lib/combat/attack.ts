import { resolveCheck, shiftAdvantage, type Advantage } from '@/lib/character/check';
import type { RoundEffects } from '@/lib/character/spells';
import { abilityModifier, normalizeAbilities, weaponFor } from '@/lib/character/constants';
import { proficiencyBonus } from '@/lib/character/classes';
import { MAGIC_ITEMS } from '@/lib/inventory/magicItems';
import { findByDisplayName } from '@/lib/character/names';
import type { PlannedAttack } from '@/lib/character/checkPlan';
import type { CharacterTag, EnemyTier } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { ARMORED_AC_BONUS, BOSS_SIGNATURE_EVERY, BOSS_SIGNATURE_TARGETS, BRUTE_DAMAGE_BONUS, FEARSOME_ROUND, NIMBLE_AC_BONUS, VENOM_DAMAGE, CRIT_SURGE_EXTRA_PIPS, LIFESTEAL_HEAL, ENEMY_ATTACK_BONUS, ENEMY_DAMAGE_DICE, HEAVY_DAMAGE_RATIO, HEAVY_PIPS, HIT_PIPS, HIT_THRESHOLD, MIN_ENEMY_DAMAGE, MIN_HIT_THRESHOLD, WEAPON_ATTACK_ABILITIES } from './constants';
import { KEEN_EYE_DEFAULT, takeWard } from '@/lib/inventory/effects';
import { armorClass } from './armorClass';
import { rollDice } from '@/lib/character/dice';
import { guardDivisor } from '@/lib/character/abilities';
import { levelForXp } from '@/lib/character/leveling';
import { damageEnemy, findActiveEnemy, hasTrait, type Encounter, type EncounterEnemy } from './encounter';
import { hasSubclass } from '@/lib/character/subclasses';
import { hasPick } from '@/lib/character/abilityPicks';
import { BLOOD_RUSH_HEAL, HAWK_EYE_BONUS, WOUND_READER_BONUS } from '@/lib/character/abilityPickConstants';
import { HUNTER_AC_REDUCTION } from '@/lib/character/subclassConstants';

/** I4: armor class bonus an enemy's traits add against player attacks. */
export const traitAcBonus = (enemy: EncounterEnemy): number =>
  (hasTrait(enemy, 'armored') ? ARMORED_AC_BONUS : 0) + (hasTrait(enemy, 'nimble') ? NIMBLE_AC_BONUS : 0);

const isLive = (e: EncounterEnemy) => e.pip > 0 && !e.fled;

export interface AttackOutcome {
  playerId: string;
  playerDisplayName: string;
  /** Name of the enemy as it is in the encounter (resolved, so `หมาป่า` may become `หมาป่า 2`). */
  target: string;
  tier: EnemyTier;
  /** The enemy's armor class the roll was compared against (after keen_eye). */
  dc: number;
  advantage: Advantage;
  dice: number[];
  die: number;
  /** I3: ability modifier of the weapon's attack ability. */
  modifier: number;
  /** I3: proficiency bonus of the attacker's level. */
  proficiency: number;
  /** I3: attack bonus of a magic weapon (0 for ordinary weapons). */
  magic: number;
  /** I3: die + modifier + proficiency + magic. */
  total: number;
  hit: boolean;
  critical: 'success' | 'failure' | null;
  /** Pips this attack removes: 0 on a miss. */
  pips: number;
  /** True when this hit takes the enemy's last pip (after earlier attacks of the same round). */
  defeated: boolean;
  damage: number;
  maxDamage: number;
  /** K5 volley: which shot this is (2 and up for the extra shots; absent for an ordinary attack or the first shot). */
  shot?: number;
}

/**
 * Pure resolution of one player attack (I3): d20 + ability modifier + proficiency + magic weapon bonus
 * against the enemy's armor class; resolveCheck supplies the advantage and natural 1 / 20 rules.
 * A heavy blow is nat 20 or damage >= 75% of the weapon's maximum.
 */
export function resolveAttack(input: {
  d20s: readonly number[];
  advantage?: Advantage;
  tier: EnemyTier;
  damage: number;
  maxDamage: number;
  /** F5j1 X1: a natural 20 removes one extra pip. */
  critSurge?: boolean;
  /** F5j3 X3: lowers the enemy's hit threshold by this much (never below 2). */
  keenEye?: number;
  /** I4: armored / nimble raise the enemy's armor class by this much. */
  acBonus?: number;
  /** I3: ability modifier, proficiency bonus and magic weapon bonus added to the d20 (default 0). */
  modifier?: number;
  proficiency?: number;
  magic?: number;
}): { dc: number; die: number; total: number; hit: boolean; critical: 'success' | 'failure' | null; pips: number } {
  const advantage = input.advantage ?? 'none';
  const dc = Math.max(MIN_HIT_THRESHOLD, HIT_THRESHOLD[input.tier] + (input.acBonus ?? 0) - (input.keenEye ?? 0));
  const bonus = (input.modifier ?? 0) + (input.proficiency ?? 0) + (input.magic ?? 0);
  const result = resolveCheck({ d20s: input.d20s, ability: 10, proficient: false, level: 1, dc, advantage, bonus });
  const used = advantage === 'none' ? input.d20s.slice(0, 1) : input.d20s.slice(0, 2);
  const die = advantage === 'advantage' ? Math.max(...used) : advantage === 'disadvantage' ? Math.min(...used) : used[0];
  if (!result.success) return { dc, die, total: result.total, hit: false, critical: result.critical, pips: 0 };
  const heavy = result.critical === 'success' || input.damage >= input.maxDamage * HEAVY_DAMAGE_RATIO;
  return { dc, die, total: result.total, hit: true, critical: result.critical, pips: (heavy ? HEAVY_PIPS : HIT_PIPS) + (result.critical === 'success' && input.critSurge ? CRIT_SURGE_EXTRA_PIPS : 0) };
}

const keenEyeOf = (character: Character): number =>
  character.itemEffects?.effects.includes('keen_eye') ? (character.itemEffects.keenEye ?? KEEN_EYE_DEFAULT) : 0;

/**
 * I3: the attack bonus parts of a character's weapon. The ability is the one the base weapon uses (the
 * higher modifier when two are listed); a magic weapon uses its base weapon's ability and adds its bonus.
 */
export function attackBonuses(character: Character): { modifier: number; proficiency: number; magic: number } {
  const weaponId = character.weaponId ?? 'fists';
  const magicItem = MAGIC_ITEMS.find((i) => i.id === weaponId);
  const mechanic = magicItem?.mechanic.kind === 'weapon' ? magicItem.mechanic : null;
  const baseId = mechanic ? mechanic.weaponId : weaponId;
  const keys = WEAPON_ATTACK_ABILITIES[baseId] ?? WEAPON_ATTACK_ABILITIES.fists;
  const abilities = normalizeAbilities(character.abilities);
  const modifier = Math.max(...keys.map((k) => abilityModifier(abilities[k])));
  // K6 archer_hawk_eye: +1 to every attack roll, added to the magic part.
  return { modifier, proficiency: proficiencyBonus(levelForXp(character.xp ?? 0)), magic: (mechanic?.damageBonus ?? 0) + (hasPick(character, 'archer_hawk_eye') ? HAWK_EYE_BONUS : 0) };
}

const maxDamageOf = (character: Character): number => {
  const { count, sides, bonus } = weaponFor(character.weaponId).dice;
  return count * sides + bonus;
}

/**
 * Rolls every planned attack. One attack per active player; the target must be a live enemy of the
 * current encounter, anything else is ignored. `damageOf` gives the damage already rolled this round.
 */
export function runAttacks(
  planned: PlannedAttack[],
  characters: Character[],
  encounter: Encounter | null,
  damageOf: (character: Character) => number | undefined,
  rollDie: () => number,
  /** K4: this round's spell effects: advantage from a blessing, `exposed` enemies. */
  effects?: RoundEffects
): AttackOutcome[] {
  if (!encounter) return [];
  const seen = new Set<string>();
  const out: AttackOutcome[] = [];
  // Simulated copy so a later attack in the same round sees the pips earlier hits already took.
  const enemies = encounter.enemies.map((e) => ({ ...e }));
  // I4 fearsome: while a live fearsome enemy stands in the first round of the fight, every attack is made with disadvantage
  // (a planned advantage just cancels out).
  const frightened = (encounter.round ?? 1) === FEARSOME_ROUND && encounter.enemies.some((e) => isLive(e) && hasTrait(e, 'fearsome'));
  for (const planAttack of planned) {
    const character = findByDisplayName(characters, planAttack.player);
    const target = findActiveEnemy(enemies, planAttack.target);
    if (!character || !target || character.status !== 'active' || seen.has(character.id)) continue;
    // K4: a blessing or an exposed target gives advantage (one source is enough, it does not stack); K5: so does an ability that grants it.
    // Fearsome then takes one step back.
    const mods = effects?.attackMods?.[character.id];
    let advantage = planAttack.advantage;
    if (effects?.advantage.has(character.id) || effects?.enemy[target.name]?.includes('exposed') || mods?.advantage) advantage = shiftAdvantage(advantage, 'up');
    if (frightened) advantage = shiftAdvantage(advantage, 'down');
    const attack = { ...planAttack, advantage };
    seen.add(character.id);
    const damage = damageOf(character) ?? 0;
    const maxDamage = maxDamageOf(character);
    const bonuses = attackBonuses(character);
    // K6 smite: the attack uses the modifier of another ability (WIS) instead of the weapon's.
    if (mods?.attackAbility) bonuses.modifier = abilityModifier(normalizeAbilities(character.abilities)[mods.attackAbility]);
    // K5: a class ability or subclass reshapes this attack (pips, several shots). K6 sweep swings at several enemies with the weapon damage.
    const volley = mods?.shots && mods.shots > 1 ? mods.shots : 0;
    const spread = !volley && mods?.spread && mods.spread > 1 ? mods.spread : 0;
    const shots = volley || spread || 1;
    // Volley: the first shot goes to the chosen enemy, each next one to the next live enemy after it (else the same one).
    // Sweep: the same, but with no other enemy standing the extra swing is simply lost.
    const followers = enemies.slice(enemies.indexOf(target) + 1).filter(isLive);
    const fire = (current: EncounterEnemy, shotNo: number, plain: boolean): AttackOutcome => {
      const shotAdvantage = attack.advantage;
      const dice = shotAdvantage === 'none' ? [rollDie()] : [rollDie(), rollDie()];
      // K5 archer_hunter: strong and boss enemies are easier to hit (acts like keen_eye, and adds to it).
      const hunter = hasSubclass(character, 'archer_hunter') && (current.tier === 'strong' || current.tier === 'boss') ? HUNTER_AC_REDUCTION : 0;
      // K6 rogue_wound_reader: a hurt enemy is easier to hit; counted with the magic bonus so the shown total adds up.
      const reader = hasPick(character, 'rogue_wound_reader') && current.pip < current.maxPip ? WOUND_READER_BONUS : 0;
      const shotBonuses = { ...bonuses, magic: bonuses.magic + reader };
      const r = resolveAttack({
        d20s: dice, advantage: shotAdvantage, tier: current.tier,
        // Volley and chain shots roll no weapon damage: a plain hit is 1 pip, only a natural 20 is heavy.
        damage: plain ? 0 : damage, maxDamage: plain ? 1 : maxDamage,
        ...shotBonuses, acBonus: mods?.ignoreTraitAc ? 0 : traitAcBonus(current), critSurge: character.itemEffects?.effects.includes('crit_surge'), keenEye: keenEyeOf(character) + hunter,
      });
      let pips = r.pips;
      if (r.hit && mods) {
        if (mods.minPips) pips = Math.max(pips, mods.minPips);
        if (mods.critPips && r.critical === 'success') pips = Math.max(pips, mods.critPips);
        if (mods.extraPipsVs?.tiers.includes(current.tier)) pips += mods.extraPipsVs.pips;
        if (mods.extraPipIfFull && current.pip >= current.maxPip) pips += mods.extraPipIfFull;
      }
      if (r.hit) damageEnemy(current, pips);
      return {
        playerId: character.id,
        playerDisplayName: character.displayName,
        target: current.name,
        tier: current.tier,
        dc: r.dc,
        advantage: shotAdvantage,
        dice,
        die: r.die,
        ...shotBonuses,
        total: r.total,
        hit: r.hit,
        critical: r.critical,
        pips: r.hit ? pips : 0,
        defeated: r.hit && current.pip === 0,
        damage,
        maxDamage,
        ...(shotNo > 1 ? { shot: shotNo } : {}),
      };
    };
    const mine: AttackOutcome[] = [];
    for (let shot = 1; shot <= shots; shot++) {
      const next = shot === 1 ? target : followers.shift() ?? (spread ? undefined : target);
      if (!next || !isLive(next)) {
        if (shots === 1) break;
        continue;
      }
      mine.push(fire(next, shot, volley > 0));
    }
    // K6 archer_chain_shot: once per round, when an arrow takes an enemy's last pip a bonus arrow flies at the weakest one left.
    if (hasPick(character, 'archer_chain_shot') && mine.some((o) => o.defeated)) {
      const weakest = enemies.filter(isLive).sort((x, y) => x.pip - y.pip)[0];
      if (weakest) mine.push(fire(weakest, shots + 1, true));
    }
    out.push(...mine);
  }
  return out;
}

/** Pure: applies each hit's pip loss in order. Does not drop a finished encounter; applyEnemyTags does. */
export function applyAttackOutcomes(encounter: Encounter | null, outcomes: AttackOutcome[]): Encounter | null {
  if (!encounter) return null;
  const enemies = encounter.enemies.map((e) => ({ ...e }));
  for (const o of outcomes) {
    if (!o.hit) continue;
    const target = findActiveEnemy(enemies, o.target);
    if (target) damageEnemy(target, o.pips);
  }
  return { enemies };
}

/**
 * F5j2 X2 lifesteal: a wearer whose hit really removed a pip heals LIFESTEAL_HEAL HP, at most once per
 * round per wearer, never above max HP, and never a downed/dead character. Pips are replayed the same
 * way applyAttackOutcomes does, so a boss held at 1 pip by the full-health rule gives nothing.
 */
export function applyLifesteal(
  characters: Character[],
  encounter: Encounter | null,
  outcomes: AttackOutcome[]
): { characters: Character[]; changes: string[] } {
  return healOnRealPipLoss(characters, encounter, outcomes, (c) => c.itemEffects?.effects.includes('lifesteal') ?? false, LIFESTEAL_HEAL, 'ดูดชีวิต');
}

/** K6 warrior_blood_rush: the same replay as lifesteal, for a warrior with the pick (BLOOD_RUSH_HEAL HP, once per round). */
export function applyBloodRush(
  characters: Character[],
  encounter: Encounter | null,
  outcomes: AttackOutcome[]
): { characters: Character[]; changes: string[] } {
  return healOnRealPipLoss(characters, encounter, outcomes, (c) => hasPick(c, 'warrior_blood_rush'), BLOOD_RUSH_HEAL, 'กระแสเลือด');
}

function healOnRealPipLoss(
  characters: Character[],
  encounter: Encounter | null,
  outcomes: AttackOutcome[],
  applies: (c: Character) => boolean,
  amount: number,
  label: string
): { characters: Character[]; changes: string[] } {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];
  if (!encounter) return { characters: next, changes };
  const enemies = encounter.enemies.map((e) => ({ ...e }));
  const healed = new Set<string>();
  for (const o of outcomes) {
    if (!o.hit) continue;
    const target = findActiveEnemy(enemies, o.target);
    if (!target) continue;
    const before = target.pip;
    damageEnemy(target, o.pips);
    if (target.pip >= before || healed.has(o.playerId)) continue;
    const wearer = next.find((c) => c.id === o.playerId);
    if (!wearer || wearer.status !== 'active' || wearer.hp <= 0 || wearer.hp >= wearer.maxHp) continue;
    if (!applies(wearer)) continue;
    healed.add(wearer.id);
    wearer.hp = Math.min(wearer.maxHp, wearer.hp + amount);
    changes.push(`${wearer.displayName} +${amount} HP ${label}`);
  }
  return { characters: next, changes };
}

/**
 * K5 berserk strike (level 5+): an attacker whose hit defeated an enemy heals AttackMods.healOnDefeat HP, once per
 * defeated enemy, never above max HP and never a downed/dead character.
 */
export function applyDefeatHeals(
  characters: Character[],
  outcomes: readonly AttackOutcome[],
  effects: RoundEffects | undefined
): { characters: Character[]; changes: string[] } {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];
  for (const o of outcomes) {
    const heal = effects?.attackMods?.[o.playerId]?.healOnDefeat ?? 0;
    if (!o.defeated || heal <= 0) continue;
    const attacker = next.find((c) => c.id === o.playerId);
    if (!attacker || attacker.status !== 'active' || attacker.hp <= 0 || attacker.hp >= attacker.maxHp) continue;
    const gained = Math.min(heal, attacker.maxHp - attacker.hp);
    attacker.hp += gained;
    changes.push(`${attacker.displayName} +${gained} HP จากการฟันศัตรูจนหมด pip`);
  }
  return { characters: next, changes };
}

export interface EnemyAttackOutcome {
  /** Enemy name as it is in the encounter (resolved, so `หมาป่า` may become `หมาป่า 2`). */
  enemy: string;
  tier: EnemyTier;
  playerId: string;
  playerDisplayName: string;
  die: number;
  bonus: number;
  total: number;
  /** The target's armor class the roll was compared against. */
  ac: number;
  hit: boolean;
  critical: 'success' | 'failure' | null;
  /** Damage dice rolled on a hit (doubled dice on a natural 20), before ward and guard; 0 on a miss. */
  damage: number;
  /** I4 pack: the roll was made with advantage (two dice, the higher kept). */
  advantage?: boolean;
  /** K4 dazed: the roll was made with disadvantage (two dice, the lower kept). */
  disadvantage?: boolean;
  /** I4 venomous: the enemy has it and hit, so the player is poisoned for the next round. */
  venomous?: boolean;
}

/** Pure: d20 + tier bonus against AC; nat 1 always misses, nat 20 always hits. */
export function resolveEnemyAttack(input: { die: number; tier: EnemyTier; ac: number }): { bonus: number; total: number; hit: boolean; critical: 'success' | 'failure' | null } {
  const bonus = ENEMY_ATTACK_BONUS[input.tier];
  const total = input.die + bonus;
  const critical = input.die === 20 ? 'success' : input.die === 1 ? 'failure' : null;
  const hit = critical === 'success' ? true : critical === 'failure' ? false : total >= input.ac;
  return { bonus, total, hit, critical };
}

/**
 * I2: rolls every planned enemy attack on the server. One attack per live enemy; the enemy must be in the
 * encounter and the target an active player, anything else is ignored. The damage dice are only rolled on a hit.
 */
export function runEnemyAttacks(
  planned: readonly { enemy: string; player: string }[],
  characters: Character[],
  encounter: Encounter | null,
  rollDie: () => number,
  rollSides: (sides: number) => number,
  /** I4: the encounter after this round's player attacks; pack looks here for mates still standing (default: `encounter`). */
  survivors?: Encounter | null,
  /** K4: this round's spell effects: a `stunned` enemy does not attack, a `dazed` one attacks with disadvantage. */
  effects?: RoundEffects
): EnemyAttackOutcome[] {
  if (!encounter) return [];
  const used = new Map<string, Set<string>>(); // enemy name -> player ids it already attacked this round
  const out: EnemyAttackOutcome[] = [];
  const signatureRound = (encounter.round ?? 1) % BOSS_SIGNATURE_EVERY === 0;
  for (const attack of planned) {
    const enemy = findActiveEnemy(encounter.enemies, attack.enemy);
    const target = findByDisplayName(characters, attack.player);
    if (!enemy || !target || target.status !== 'active') continue;
    if (effects?.enemy[enemy.name]?.includes('stunned')) continue;
    // K6 rogue_shadow_step: the enemy cannot find a hidden target this round.
    if (effects?.hidden?.has(target.id)) continue;
    const targets = used.get(enemy.name) ?? new Set<string>();
    const limit = signatureRound && enemy.tier === 'boss' && hasTrait(enemy, 'boss_signature') ? BOSS_SIGNATURE_TARGETS : 1;
    if (targets.size >= limit || targets.has(target.id)) continue;
    targets.add(target.id);
    used.set(enemy.name, targets);
    const mates = (survivors ?? encounter).enemies.some((e) => e.name !== enemy.name && isLive(e));
    const pack = hasTrait(enemy, 'pack') && mates;
    const dazed = effects?.enemy[enemy.name]?.includes('dazed') ?? false;
    // pack (advantage) and dazed (disadvantage) cancel into one ordinary roll.
    const advantage = pack && !dazed;
    const disadvantage = dazed && !pack;
    const first = rollDie();
    const die = advantage ? Math.max(first, rollDie()) : disadvantage ? Math.min(first, rollDie()) : first;
    const ac = armorClass(target);
    const r = resolveEnemyAttack({ die, tier: enemy.tier, ac });
    const spec = ENEMY_DAMAGE_DICE[enemy.tier];
    const dice = r.hit ? rollDice(r.critical === 'success' ? { ...spec, count: spec.count * 2 } : spec, rollSides) : 0;
    const damage = r.hit && hasTrait(enemy, 'brute') ? dice + BRUTE_DAMAGE_BONUS : dice;
    out.push({ enemy: enemy.name, tier: enemy.tier, playerId: target.id, playerDisplayName: target.displayName, die, bonus: r.bonus, total: r.total, ac, hit: r.hit, critical: r.critical, damage, ...(advantage ? { advantage } : {}), ...(disadvantage ? { disadvantage } : {}), venomous: r.hit && hasTrait(enemy, 'venomous') });
  }
  return out;
}

/**
 * I2: applies rolled enemy hits. Armor is already part of the AC so it no longer reduces damage, but the
 * target's ward (F5j4, first hit of the round) and the warrior's guard (ยืนบัง, who takes the hit instead) still do.
 */
export function applyEnemyAttackOutcomes(
  characters: Character[],
  outcomes: readonly EnemyAttackOutcome[],
  /** F5j4 ward: ids of wearers whose ward is already spent this round; shared with applyCharacterTags. */
  wardUsed: Set<string> = new Set(),
  /** Protected ally id -> the warrior guarding them this round (see applyAbilityActions). */
  guards: Record<string, string> = {}
): { characters: Character[]; changes: string[] } {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];
  const evasionUsed = new Set<string>();
  const down = (c: Character) => {
    c.hp = Math.max(0, c.hp);
    if (c.hp === 0) {
      c.status = 'downed';
      changes.push(`${c.displayName} ล้มลง`);
    }
  };
  for (const o of outcomes) {
    const head = `${o.enemy} โจมตี ${o.playerDisplayName}: ทอย ${o.die}${o.bonus >= 0 ? '+' : '-'}${Math.abs(o.bonus)} = ${o.total} เทียบ AC ${o.ac}`;
    if (!o.hit) {
      changes.push(`${head} พลาด${o.critical === 'failure' ? ' (ทอยได้ 1)' : ''}`);
      continue;
    }
    const target = next.find((c) => c.id === o.playerId);
    if (!target || target.status !== 'active') continue;
    const crit = o.critical === 'success' ? ' คริติคอล' : '';
    const guard = guards[target.id] ? next.find((c) => c.id === guards[target.id]) : undefined;
    if (guard && guard.status === 'active' && guard.id !== target.id) {
      const damage = Math.max(MIN_ENEMY_DAMAGE, Math.ceil((o.damage - takeWard(guard, wardUsed)) / guardDivisor(levelForXp(guard.xp ?? 0))));
      guard.hp -= damage;
      changes.push(`${head} โดน${crit}: ${guard.displayName} รับดาเมจแทน ${target.displayName} −${damage} HP`);
      down(guard);
    } else {
      let damage = Math.max(MIN_ENEMY_DAMAGE, o.damage - takeWard(target, wardUsed));
      const absorbed = o.damage - damage;
      // K6 rogue_evasion: the first hit of the round that does damage is halved (rounded up), after ward.
      const evaded = hasPick(target, 'rogue_evasion') && !evasionUsed.has(target.id);
      if (evaded) {
        evasionUsed.add(target.id);
        damage = Math.ceil(damage / 2);
      }
      target.hp -= damage;
      changes.push(`${head} โดน${crit} −${damage} HP${absorbed > 0 ? ` (เกราะวิเศษกัน ${absorbed})` : ''}${evaded ? ' (หลบเหลี่ยม ลดดาเมจครึ่งหนึ่ง)' : ''}`);
      down(target);
    }
  }
  return { characters: next, changes };
}

/**
 * Pure, narration-only fallback (I2): an [[enemy_attack]] tag the DM wrote anyway is rolled with the same
 * formula, just after the fact (the story may not match the dice). Returns the outcomes already applied.
 */
export function applyEnemyAttackTags(
  characters: Character[],
  encounter: Encounter | null,
  tags: CharacterTag[],
  rollDie: () => number,
  rollSides: (sides: number) => number,
  wardUsed: Set<string> = new Set(),
  guards: Record<string, string> = {},
  effects?: RoundEffects
): { characters: Character[]; changes: string[]; outcomes: EnemyAttackOutcome[] } {
  const planned = tags.flatMap((t) => (t.kind === 'enemy_attack' ? [{ enemy: t.enemy, player: t.player }] : []));
  const outcomes = runEnemyAttacks(planned, characters, encounter, rollDie, rollSides, undefined, effects);
  return { ...applyEnemyAttackOutcomes(characters, outcomes, wardUsed, guards), outcomes };
}

/**
 * I4 venomous: players poisoned by a hit last round lose VENOM_DAMAGE HP at the start of this one. Poison weakens
 * but never downs anyone (HP stays at 1 or more), and a player who is not active any more is skipped.
 */
export function applyVenom(characters: Character[], poisoned: readonly string[] | undefined): { characters: Character[]; changes: string[] } {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];
  for (const id of new Set(poisoned ?? [])) {
    const c = next.find((x) => x.id === id);
    if (!c || c.status !== 'active' || c.hp <= 1) continue;
    c.hp = Math.max(1, c.hp - VENOM_DAMAGE);
    changes.push(`${c.displayName} −${VENOM_DAMAGE} HP จากพิษ`);
  }
  return { characters: next, changes };
}
