import { archerRolls, clericHealTier, rogueBonusDice } from './abilities';
import { classOf } from './classes';
import { TIERS, weaponFor } from './constants';
import { rollDice } from './dice';
import { levelDamageBonus, levelForXp } from './leveling';
import { SANCTUARY_CHANGE } from './applyTags';
import { QUICK_TEMPO_EXTRA } from '@/lib/inventory/effects';
import { ENEMY_SAVE_BONUS } from '@/lib/combat/constants';
import { findActiveEnemy, type Encounter } from '@/lib/combat/encounter';
import { emptyRoundEffects, rollEnemySave, type EnemyStatus, type RoundEffects } from './spells';
import { abilitySaveDc, hasSubclass, mainCooldownFor, replacementOf } from './subclasses';
import { hasPick, isPickAbilityId, PICK_ABILITIES } from './abilityPicks';
import { TWIN_SPARK_DIVISOR } from './abilityPickConstants';
import { resolvePickAbility } from './pickAbilities';
import {
  BERSERK_CRIT_PIPS, BERSERK_AC_PENALTY, BERSERK_HEAL_ON_DEFEAT, BERSERK_MIN_PIPS, ASSASSIN_EXTRA_PIPS_IF_FULL, FEINT_AC_BONUS,
  GUARDIAN_AC_BONUS, HUNTER_EXTRA_PIPS, LIFE_HEAL_BONUS, VOLLEY_SHOTS, VOLLEY_SHOTS_HI,
} from './subclassConstants';
import { ABILITY_UPGRADE_LEVEL } from './abilities';
import { SPELL_AOE_MAX_TARGETS } from './spellConstants';
import type { SpellRollEntry } from './applySpells';
import type { Character } from './types';

export interface AbilityAction {
  playerId?: string;
  useAbility?: boolean;
  abilityTargetId?: string | null;
  /** K2: which ability; absent or the class id = the class's main ability. */
  abilityId?: string | null;
  /** K5: enemy name for an ability that targets an enemy (feint); the same column scrolls and spells use. */
  itemTarget?: string | null;
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
  /** K5: abilities used that keep their own cooldown in the per-ability map (a subclass replacement ability). */
  usedExtra: { playerId: string; abilityId: string; cooldown: number }[];
  /** K5: this round one-round effects set by abilities (AC, enemy statuses, attack modifiers); spells add to them. */
  effects: RoundEffects;
  /** K5: enemy saves rolled by abilities (feint, radiant light), ready for the roll summary. */
  rolls: SpellRollEntry[];
  /** K6: the fight after abilities took pips off (mage_meteor); the input one when nothing did. */
  encounter: Encounter | null;
  /** K6: players whose ability took their whole action (mage_recover, mage_meteor): no spell and no weapon attack. */
  actionSpent: string[];
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
  rollDie: (sides: number) => number,
  /** K5: the fight as it is now; needed by abilities that make enemies save (feint, radiant light). */
  encounter: Encounter | null = null
): AbilityResult {
  const next = characters.map((c) => ({ ...c }));
  const notes: Record<string, string> = {};
  const damage: Record<string, number> = {};
  const guards: Record<string, string> = {};
  const used: string[] = [];
  const usedAbilities: { playerId: string; abilityId: string }[] = [];
  const changes: string[] = [];
  const usedExtra: { playerId: string; abilityId: string; cooldown: number }[] = [];
  const effects = emptyRoundEffects();
  const rolls: SpellRollEntry[] = [];
  const actionSpent: string[] = [];
  let workingEncounter = encounter;
  const addAc = (id: string, n: number) => {
    effects.acBonus[id] = (effects.acBonus[id] ?? 0) + n;
  };
  const addStatus = (enemy: string, status: EnemyStatus) => {
    effects.enemy[enemy] = [...(effects.enemy[enemy] ?? []).filter((x) => x !== status), status];
  };
  const setMods = (id: string, mods: NonNullable<RoundEffects['attackMods']>[string]) => {
    effects.attackMods = { ...effects.attackMods, [id]: { ...effects.attackMods?.[id], ...mods } };
  };

  for (const action of actions) {
    // A potion and an ability are two different actions; the potion already resolved.
    if (!action.useAbility || !action.playerId || action.useItemId) continue;
    const user = next.find((c) => c.id === action.playerId);
    if (!user) continue;
    const cls = classOf(user.classId);
    // K6: an ability picked at level 6 / 9. Only the owner's own pick works, and only an active one.
    if (isPickAbilityId(action.abilityId)) {
      const def = PICK_ABILITIES[action.abilityId];
      if (user.status !== 'active' || def.kind !== 'active' || !hasPick(user, def.id) || cooldownOf(user, def.id) > 0) {
        notes[user.id] = `tried to use ${def.nameTh} but it was not ready`;
        continue;
      }
      const r = resolvePickAbility({
        def, user, characters: next, encounter: workingEncounter, target: action.itemTarget ?? null, effects, rolls, rollDie,
      });
      notes[user.id] = r.note;
      if (!r.ok) continue;
      workingEncounter = r.encounter;
      if (r.change) changes.push(r.change);
      if (r.spentAction) actionSpent.push(user.id);
      usedExtra.push({ playerId: user.id, abilityId: def.id, cooldown: def.cooldown });
      usedAbilities.push({ playerId: user.id, abilityId: def.id });
      continue;
    }
    // K4: the mage's main ability (arcane surge) rides on a spell cast and is resolved with it (applySpellActions).
    if (cls?.id === 'mage') continue;
    // K5: a subclass may put a replacement ability in place of the main one; the main ability id or none picks it.
    const replacement = cls ? replacementOf(user) : null;
    const mainName = replacement?.nameTh ?? cls?.ability.nameTh;
    const fail = (reason = 'it was not ready') => {
      notes[user.id] = `tried to use ${mainName ?? 'a class ability'} but ${reason}`;
    };
    // K2: only the class main ability (id = class id) or its K5 replacement is defined so far; any other id is refused.
    const abilityId = action.abilityId || cls?.id;
    const mainId = replacement ? replacement.id : cls?.id;
    if (!cls || user.status !== 'active' || (abilityId !== cls.id && abilityId !== mainId) || cooldownOf(user, mainId!) > 0) {
      fail();
      continue;
    }

    const { ability } = cls;
    const level = levelForXp(user.xp ?? 0);
    if (replacement) {
      if (replacement.id === 'berserk_strike') {
        setMods(user.id, {
          advantage: true,
          minPips: BERSERK_MIN_PIPS,
          critPips: BERSERK_CRIT_PIPS,
          ...(level >= ABILITY_UPGRADE_LEVEL ? { healOnDefeat: BERSERK_HEAL_ON_DEFEAT } : {}),
        });
        addAc(user.id, -BERSERK_AC_PENALTY);
        notes[user.id] = `used ${replacement.nameTh}: the attack this round is made with advantage and removes at least ${BERSERK_MIN_PIPS} pips, but AC is ${BERSERK_AC_PENALTY} lower for the whole round`;
        changes.push(`${user.displayName} ใช้${replacement.nameTh}`);
      } else if (replacement.id === 'volley') {
        const shots = level >= ABILITY_UPGRADE_LEVEL ? VOLLEY_SHOTS_HI : VOLLEY_SHOTS;
        setMods(user.id, { shots });
        notes[user.id] = `used ${replacement.nameTh}: the attack this round is ${shots} separate shots at the chosen enemy and the next ones standing, 1 pip per hit`;
        changes.push(`${user.displayName} ใช้${replacement.nameTh} (${shots} ลูก)`);
      } else {
        const enemy = encounter ? findActiveEnemy(encounter.enemies.map((e) => ({ ...e })), action.itemTarget ?? '') : undefined;
        if (!enemy) {
          fail('there was no enemy of that name still standing');
          continue;
        }
        const dc = abilitySaveDc(user, 'DEX');
        const die = rollDie(20);
        const save = rollEnemySave({ tier: enemy.tier, dc, die });
        addStatus(enemy.name, 'exposed');
        if (!save.saved) addStatus(enemy.name, 'dazed');
        addAc(user.id, FEINT_AC_BONUS);
        rolls.push({
          kind: 'save', target: enemy.name, tier: enemy.tier, die, bonus: ENEMY_SAVE_BONUS[enemy.tier], total: save.total, dc,
          success: save.saved, critical: save.critical, pips: 0, playerDisplayName: user.displayName, spellNameTh: replacement.nameTh,
        });
        notes[user.id] = `used ${replacement.nameTh} on ${enemy.name}: ${save.saved ? 'it resisted the dazzle but is left exposed' : 'it is dazed and exposed'} (allies attack it with advantage), and ${user.displayName} has AC +${FEINT_AC_BONUS} this round`;
        changes.push(`${user.displayName} ใช้${replacement.nameTh} ใส่ ${enemy.name}: ${save.saved ? 'ผ่านเซฟ แต่เปิดช่องโหว่' : 'ไม่ผ่านเซฟ มึนงงและเปิดช่องโหว่'}`);
      }
      usedExtra.push({ playerId: user.id, abilityId: replacement.id, cooldown: replacement.cooldown });
      usedAbilities.push({ playerId: user.id, abilityId: replacement.id });
      continue;
    }

    let target: Character | undefined;
    if (ability.target) {
      target = next.find((c) => c.id === action.abilityTargetId);
      if (!target || target.status !== 'active' || (ability.target === 'ally' && target.id === user.id)) {
        fail();
        continue;
      }
    }

    const weapon = weaponFor(user.weaponId);
    if (cls.id === 'warrior' && target) {
      // Only one guard per ally; the later warrior keeps their cooldown.
      if (target.id in guards) {
        const guardian = next.find((c) => c.id === guards[target.id]);
        fail(`${guardian?.displayName ?? 'someone'} is already shielding ${target.displayName}`);
        continue;
      }
      guards[target.id] = user.id;
      if (hasSubclass(user, 'warrior_guardian')) addAc(user.id, GUARDIAN_AC_BONUS);
      notes[user.id] = `used ${ability.nameTh} to shield ${target.displayName} this round`;
      changes.push(`${user.displayName} ใช้${ability.nameTh} ปกป้อง ${target.displayName}`);
    } else if (cls.id === 'cleric' && target) {
      // K5 cleric_radiant: the light works even when nobody needs healing.
      const radiant = hasSubclass(user, 'cleric_radiant');
      if (target.hp >= target.maxHp && !radiant) {
        fail(`${target.displayName} is not hurt`);
        continue;
      }
      const tier = radiant ? (level >= ABILITY_UPGRADE_LEVEL ? 'medium' : 'light') : clericHealTier(level);
      const heal = target.hp >= target.maxHp ? 0 : rollDice(TIERS[tier], rollDie) + (hasSubclass(user, 'cleric_life') ? LIFE_HEAL_BONUS : 0);
      const gained = Math.min(target.maxHp - target.hp, heal);
      target.hp += gained;
      const dazed: string[] = [];
      if (radiant && encounter) {
        const dc = abilitySaveDc(user, 'WIS');
        for (const enemy of encounter.enemies.filter((e) => e.pip > 0 && !e.fled).slice(0, SPELL_AOE_MAX_TARGETS)) {
          const die = rollDie(20);
          const save = rollEnemySave({ tier: enemy.tier, dc, die });
          rolls.push({
            kind: 'save', target: enemy.name, tier: enemy.tier, die, bonus: ENEMY_SAVE_BONUS[enemy.tier], total: save.total, dc,
            success: save.saved, critical: save.critical, pips: 0, playerDisplayName: user.displayName, spellNameTh: ability.nameTh,
          });
          if (!save.saved) {
            addStatus(enemy.name, 'dazed');
            dazed.push(enemy.name);
          }
        }
      }
      // K6 cleric_twin_spark: healing a friend also heals the most hurt other friend for half of the roll.
      let twin = '';
      if (hasPick(user, 'cleric_twin_spark') && target.id !== user.id && heal > 0) {
        const second = next.filter((c) => c.status === 'active' && c.id !== user.id && c.id !== target.id && c.hp < c.maxHp).sort((a, b) => a.hp - b.hp)[0];
        if (second) {
          const bonus = Math.min(second.maxHp - second.hp, Math.max(1, Math.floor(heal / TWIN_SPARK_DIVISOR)));
          second.hp += bonus;
          twin = ` ${second.displayName} +${bonus} HP`;
        }
      }
      notes[user.id] =
        `used ${ability.nameTh} on ${target.displayName} and restored ${gained} HP` +
        (twin ? `; the twin spark also restored${twin}` : '') +
        (radiant ? (dazed.length > 0 ? `; the radiant light dazed ${dazed.join(', ')} for this round` : '; the radiant light dazed no enemy') : '');
      changes.push(
        (target.id === user.id
          ? `${user.displayName} ใช้${ability.nameTh} (+${gained} HP)`
          : `${user.displayName} ใช้${ability.nameTh} ให้ ${target.displayName} (+${gained} HP)`) +
          (dazed.length > 0 ? ` แสงทำให้ ${dazed.join(', ')} มึนงง` : '') +
          (twin ? ` ประกายซ้ำ${twin}` : '')
      );
    } else {
      let total = levelDamageBonus(level);
      if (cls.id === 'archer') {
        for (let i = 0; i < archerRolls(level); i++) total += rollDice(weapon.dice, rollDie);
      } else {
        total += rollDice(weapon.dice, rollDie) + rollDice(rogueBonusDice(level), rollDie);
      }
      damage[user.id] = total;
      // K5: hunter precise shot hurts strong/boss enemies more; assassin backstab has advantage and punishes a fresh enemy.
      if (cls.id === 'archer' && hasSubclass(user, 'archer_hunter')) setMods(user.id, { extraPipsVs: { tiers: ['strong', 'boss'], pips: HUNTER_EXTRA_PIPS } });
      if (cls.id === 'rogue' && hasSubclass(user, 'rogue_assassin')) setMods(user.id, { advantage: true, extraPipIfFull: ASSASSIN_EXTRA_PIPS_IF_FULL });
      notes[user.id] = `used ${ability.nameTh}: damage roll ${total}`;
      changes.push(`${user.displayName} ใช้${ability.nameTh}`);
    }
    used.push(user.id);
    usedAbilities.push({ playerId: user.id, abilityId: cls.id });
  }

  return { characters: next, notes, damage, guards, used, usedAbilities, changes, usedExtra, effects, rolls, encounter: workingEncounter, actionSpent };
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
    if (cls && used.includes(c.id)) cooldown = mainCooldownFor(c, cls.ability.cooldown);
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
