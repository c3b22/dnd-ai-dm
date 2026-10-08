/**
 * K6: resolves the ACTIVE abilities picked at level 6 / 9 (docs/class-options-draft.md section 6). Called by
 * applyAbilityActions for an action whose `abilityId` is a pick id. Pure: it only changes the working copies it
 * is handed (the characters, the encounter, this round's effects and rolls) and reports the result as text.
 * The passive picks are not here: they live where they apply (armorClass, combat/attack.ts, spells.ts, ...).
 */
import { TIERS } from './constants';
import { rollDice } from './dice';
import { ENEMY_SAVE_BONUS } from '@/lib/combat/constants';
import { damageEnemy, findActiveEnemy, type Encounter, type EncounterEnemy } from '@/lib/combat/encounter';
import type { PickAbilityDef } from './abilityPicks';
import {
  METEOR_PIPS, PIERCING_CRIT_PIPS, PIERCING_MIN_PIPS, RECOVER_SLOTS, SMITE_CRIT_PIPS, SMITE_MIN_PIPS, SWEEP_TARGETS, WARD_PRAYER_AC,
} from './abilityPickConstants';
import { EVOKER_DC_BONUS } from './subclassConstants';
import { SPELL_AOE_MAX_TARGETS } from './spellConstants';
import { abilitySaveDc, hasSubclass, type AttackMods } from './subclasses';
import { rollEnemySave, spellSaveDc, spellSlotsOf, withSpellSlots, type EnemyStatus, type RoundEffects } from './spells';
import type { SpellRollEntry } from './applySpells';
import type { Character } from './types';

export interface PickContext {
  def: PickAbilityDef;
  user: Character;
  /** The working copy of every character; heals and slot changes are written into it. */
  characters: Character[];
  /** The fight as it is now (null = none). Replaced, never mutated, when an ability takes pips off. */
  encounter: Encounter | null;
  /** Enemy name the player picked (for an ability that targets an enemy). */
  target: string | null;
  effects: RoundEffects;
  rolls: SpellRollEntry[];
  rollDie: (sides: number) => number;
}

export interface PickResult {
  ok: boolean;
  /** For the DM: what happened, or why nothing did. */
  note: string;
  /** Thai game-log line (only when ok). */
  change?: string;
  encounter: Encounter | null;
  /** True when the ability took the player's whole action (no spell, no weapon attack this round). */
  spentAction?: boolean;
}

const isLive = (e: EncounterEnemy) => e.pip > 0 && !e.fled;

function addStatus(effects: RoundEffects, enemy: string, status: EnemyStatus): void {
  effects.enemy[enemy] = [...(effects.enemy[enemy] ?? []).filter((x) => x !== status), status];
}

function setMods(effects: RoundEffects, id: string, mods: AttackMods): void {
  effects.attackMods = { ...effects.attackMods, [id]: { ...effects.attackMods?.[id], ...mods } };
}

/** A save-or-suffer roll for one enemy, recorded for the roll summary. Returns whether the enemy saved. */
function enemySave(ctx: PickContext, enemy: EncounterEnemy, dc: number, pips = 0): boolean {
  const die = ctx.rollDie(20);
  const save = rollEnemySave({ tier: enemy.tier, dc, die });
  ctx.rolls.push({
    kind: 'save', target: enemy.name, tier: enemy.tier, die, bonus: ENEMY_SAVE_BONUS[enemy.tier], total: save.total, dc,
    success: save.saved, critical: save.critical, pips: save.saved ? 0 : pips, playerDisplayName: ctx.user.displayName, spellNameTh: ctx.def.nameTh,
  });
  return save.saved;
}

const refuse = (ctx: PickContext, reason: string): PickResult => ({
  ok: false,
  note: `tried to use ${ctx.def.nameTh} but ${reason}`,
  encounter: ctx.encounter,
});

/** Resolves one active pick. A refusal changes nothing (the caller starts no cooldown). */
export function resolvePickAbility(ctx: PickContext): PickResult {
  const { def, user, effects } = ctx;
  const name = user.displayName;
  const live = ctx.encounter ? ctx.encounter.enemies.filter(isLive) : [];
  const needEnemies = (): PickResult | null => (live.length === 0 ? refuse(ctx, 'there was no enemy still standing') : null);
  const unhurt = (c: Character) => c.hp >= c.maxHp;

  switch (def.id) {
    case 'warrior_war_cry': {
      const none = needEnemies();
      if (none) return none;
      const dc = abilitySaveDc(user, 'STR');
      const dazed: string[] = [];
      for (const e of live.slice(0, SPELL_AOE_MAX_TARGETS)) {
        if (!enemySave(ctx, e, dc)) {
          addStatus(effects, e.name, 'dazed');
          dazed.push(e.name);
        }
      }
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: ${dazed.length > 0 ? `${dazed.join(', ')} are dazed this round (their attacks have disadvantage)` : 'every enemy resisted'}`,
        change: `${name} ใช้${def.nameTh}${dazed.length > 0 ? ` ทำให้ ${dazed.join(', ')} มึนงง` : ' แต่ศัตรูทุกตัวผ่านเซฟ'}`,
      };
    }
    case 'archer_snare': {
      const enemy = ctx.encounter ? findActiveEnemy(ctx.encounter.enemies.map((e) => ({ ...e })), ctx.target ?? '') : undefined;
      if (!enemy) return refuse(ctx, 'there was no enemy of that name still standing');
      const saved = enemySave(ctx, enemy, abilitySaveDc(user, 'DEX'));
      if (!saved) addStatus(effects, enemy.name, enemy.tier === 'boss' ? 'dazed' : 'stunned');
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh} on ${enemy.name}: ${saved ? 'it slipped the trap' : enemy.tier === 'boss' ? 'it is tangled and dazed this round' : 'it is caught and cannot attack this round'}`,
        change: `${name} ใช้${def.nameTh} ใส่ ${enemy.name}: ${saved ? 'ผ่านเซฟ หลุดบ่วง' : enemy.tier === 'boss' ? 'ไม่ผ่านเซฟ มึนงง' : 'ไม่ผ่านเซฟ ถูกตรึง'}`,
      };
    }
    case 'warrior_sweep':
      setMods(effects, user.id, { spread: SWEEP_TARGETS });
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: the attack this round is a sweep at the chosen enemy and the next one standing, each swing rolled separately`,
        change: `${name} ใช้${def.nameTh}`,
      };
    case 'archer_piercing_arrow':
      setMods(effects, user.id, { advantage: true, minPips: PIERCING_MIN_PIPS, critPips: PIERCING_CRIT_PIPS, ignoreTraitAc: true });
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: the attack this round has advantage, ignores extra armor and removes at least ${PIERCING_MIN_PIPS} pips`,
        change: `${name} ใช้${def.nameTh}`,
      };
    case 'cleric_smite':
      setMods(effects, user.id, { attackAbility: 'WIS', minPips: SMITE_MIN_PIPS, critPips: SMITE_CRIT_PIPS });
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: the attack this round is a holy strike that removes at least ${SMITE_MIN_PIPS} pips`,
        change: `${name} ใช้${def.nameTh}`,
      };
    case 'cleric_ward_prayer': {
      const friends = ctx.characters.filter((c) => c.status === 'active');
      for (const c of friends) effects.acBonus[c.id] = (effects.acBonus[c.id] ?? 0) + WARD_PRAYER_AC;
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: ${friends.map((c) => c.displayName).join(', ')} have AC +${WARD_PRAYER_AC} for this round`,
        change: `${name} ใช้${def.nameTh} ทุกคน AC +${WARD_PRAYER_AC}`,
      };
    }
    case 'cleric_mass_heal': {
      const hurt = ctx.characters.filter((c) => c.status === 'active' && c.id !== user.id && !unhurt(c));
      if (hurt.length === 0) return refuse(ctx, 'none of the others is hurt');
      const lines: string[] = [];
      for (const c of hurt) {
        const gained = Math.min(c.maxHp - c.hp, rollDice(TIERS.medium, ctx.rollDie));
        c.hp += gained;
        lines.push(`${c.displayName} +${gained}`);
      }
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: restored HP to ${lines.join(', ')}`,
        change: `${name} ใช้${def.nameTh} (${lines.join(', ')} HP)`,
      };
    }
    case 'rogue_smoke_veil': {
      const none = needEnemies();
      if (none) return none;
      for (const e of live) addStatus(effects, e.name, 'dazed');
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: smoke dazes ${live.map((e) => e.name).join(', ')} this round (no save)`,
        change: `${name} ใช้${def.nameTh} ศัตรูทุกตัวมึนงง`,
      };
    }
    case 'rogue_shadow_step':
      effects.hidden = new Set([...(effects.hidden ?? []), user.id]);
      return {
        ok: true, encounter: ctx.encounter,
        note: `used ${def.nameTh}: ${name} vanishes into the shadows; enemies cannot target them this round`,
        change: `${name} ใช้${def.nameTh}`,
      };
    case 'mage_recover': {
      const slots = spellSlotsOf(user);
      if (!slots || slots.current >= slots.max) return refuse(ctx, 'the spell slots are already full');
      const restored = Math.min(RECOVER_SLOTS, slots.max - slots.current);
      const index = ctx.characters.findIndex((c) => c.id === user.id);
      ctx.characters[index] = withSpellSlots(ctx.characters[index], { max: slots.max, current: slots.current + restored });
      return {
        ok: true, encounter: ctx.encounter, spentAction: true,
        note: `used ${def.nameTh}: regained ${restored} spell slot${restored > 1 ? 's' : ''} and cast nothing else this round`,
        change: `${name} ใช้${def.nameTh} คืนช่องเวท ${restored} ช่อง (${slots.current + restored}/${slots.max})`,
      };
    }
    case 'mage_meteor': {
      const none = needEnemies();
      if (none) return none;
      const dc = spellSaveDc(user, hasSubclass(user, 'mage_evoker') ? EVOKER_DC_BONUS : 0);
      const enemies = ctx.encounter!.enemies.map((e) => ({ ...e }));
      const hit: string[] = [];
      for (const e of enemies.filter(isLive).slice(0, SPELL_AOE_MAX_TARGETS)) {
        if (!enemySave(ctx, e, dc, METEOR_PIPS)) {
          damageEnemy(e, METEOR_PIPS);
          hit.push(e.name);
        }
      }
      return {
        ok: true, encounter: { ...ctx.encounter!, enemies }, spentAction: true,
        note: `used ${def.nameTh} (no spell slot spent, no other spell this round): ${hit.length > 0 ? `${hit.join(', ')} each lose ${METEOR_PIPS} pips` : 'every enemy resisted'}`,
        change: `${name} ใช้${def.nameTh}${hit.length > 0 ? ` ${hit.join(', ')} −${METEOR_PIPS} pip` : ' แต่ศัตรูทุกตัวผ่านเซฟ'}`,
      };
    }
    default:
      return refuse(ctx, 'it is a passive ability that works by itself');
  }
}
