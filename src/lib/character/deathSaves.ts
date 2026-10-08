/**
 * H1 death saves (pure, caller supplies the dice).
 *
 * A character at 0 HP is `downed` ("dying"). Each round they roll one d20 against DC 10
 * (resolved with `resolveCheck`, D3): 10+ = success, below = failure, nat 1 = two failures,
 * nat 20 = back up with 1 HP. 3 successes = stable (stop rolling), 3 failures = dead.
 *
 * "Dead" here keeps the existing meaning of downed: the character stays `downed` with hp 0 and
 * can still be brought back by `[[revive]]` or a wipe/sanctuary. Nobody disappears for good
 * (permadeath is H2/H3). Every place that reacts to the third failure goes through
 * `onDeathSavesFailed`, the one hook F5g (revival charm, implemented) and H3a (permadeath) attach to.
 */
import { resolveCheck } from './check';
import { catalogEntry } from '@/lib/inventory/catalog';
import type { Character } from './types';

export const DEATH_SAVE_DC = 10;
const LIMIT = 3;

export interface DeathSaves {
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
}

export const EMPTY_DEATH_SAVES: DeathSaves = { successes: 0, failures: 0, stable: false, dead: false };

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(LIMIT, Math.max(0, Math.floor(v))) : 0);

/** Reads players.death_saves; missing column, null or junk = no saves yet. */
export function normalizeDeathSaves(raw: unknown): DeathSaves {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DEATH_SAVES };
  const o = raw as Record<string, unknown>;
  return { successes: count(o.successes), failures: count(o.failures), stable: o.stable === true, dead: o.dead === true };
}

export type DeathSaveOutcome = 'pass' | 'fail' | 'recovered' | 'stable' | 'dead';

export interface DeathSaveResult {
  outcome: DeathSaveOutcome;
  saves: DeathSaves;
  check: ReturnType<typeof resolveCheck>;
}

export function resolveDeathSave(current: DeathSaves, die: number): DeathSaveResult {
  const check = resolveCheck({ d20s: [die], ability: 10, proficient: false, level: 1, dc: DEATH_SAVE_DC });
  if (check.critical === 'success') return { outcome: 'recovered', saves: { ...EMPTY_DEATH_SAVES }, check };
  const saves = { ...current };
  if (check.success) saves.successes = Math.min(LIMIT, saves.successes + 1);
  else saves.failures = Math.min(LIMIT, saves.failures + (check.critical === 'failure' ? 2 : 1));
  if (saves.failures >= LIMIT) return { outcome: 'dead', saves: { ...saves, dead: true }, check };
  if (saves.successes >= LIMIT) return { outcome: 'stable', saves: { ...saves, stable: true }, check };
  return { outcome: check.success ? 'pass' : 'fail', saves, check };
}

/**
 * The single point where "3 failed death saves" is handled. A worn revive charm (F5g) stands the
 * wearer up at the charm's HP and is spent (`revive`); otherwise a log line, nothing is lost.
 */
export function onDeathSavesFailed(character: Character): { changes: string[]; revive?: { itemId: string; hp: number } } {
  const charm = character.reviveCharm;
  if (charm) {
    const hp = Math.max(1, Math.min(character.maxHp, charm.reviveHp));
    const label = catalogEntry(charm.itemId)?.nameTh ?? 'เครื่องราง';
    return {
      changes: [`${character.displayName} สิ้นใจ แต่${label}แตกสลายและดึงกลับมาด้วย ${hp} HP (เครื่องรางสลายไปแล้ว)`],
      revive: { itemId: charm.itemId, hp },
    };
  }
  return { changes: [`${character.displayName} สิ้นใจ (ยังชุบได้ด้วยการคืนชีพหรือสถานที่ปลอดภัย)`] };
}

export interface DeathSaveRoll {
  playerDisplayName: string;
  die: number;
  dc: number;
  total: number;
  success: boolean;
  critical: 'success' | 'failure' | null;
  outcome: DeathSaveOutcome;
}

export function canRollDeathSave(c: Character): boolean {
  if (c.status !== 'downed') return false;
  const s = normalizeDeathSaves(c.deathSaves);
  return !s.stable && !s.dead;
}

export function runDeathSaves(
  characters: Character[],
  rollDie: () => number
): { characters: Character[]; outcomes: DeathSaveRoll[]; changes: string[]; died: string[]; charmsSpent: { characterId: string; itemId: string }[] } {
  const outcomes: DeathSaveRoll[] = [];
  const changes: string[] = [];
  const died: string[] = [];
  const charmsSpent: { characterId: string; itemId: string }[] = [];
  const next = characters.map((c) => {
    if (!canRollDeathSave(c)) return c;
    const die = rollDie();
    const r = resolveDeathSave(normalizeDeathSaves(c.deathSaves), die);
    outcomes.push({ playerDisplayName: c.displayName, die, dc: DEATH_SAVE_DC, total: r.check.total, success: r.check.success, critical: r.check.critical, outcome: r.outcome });
    const tally = `ผ่าน ${r.saves.successes}/3 ล้มเหลว ${r.saves.failures}/3`;
    if (r.outcome === 'recovered') {
      changes.push(`${c.displayName} ทอยเอาชีวิตรอดได้ 20 ฟื้นขึ้นมาด้วย 1 HP`);
      return { ...c, hp: 1, status: 'active' as const, deathSaves: null };
    }
    const updated = { ...c, deathSaves: r.saves };
    if (r.outcome === 'dead') {
      const failed = onDeathSavesFailed(updated);
      changes.push(`${c.displayName} ทอยเอาชีวิตรอด ${die} ล้มเหลว (${tally})`, ...failed.changes);
      if (failed.revive) {
        charmsSpent.push({ characterId: c.id, itemId: failed.revive.itemId });
        return { ...c, hp: failed.revive.hp, status: 'active' as const, deathSaves: null, reviveCharm: null };
      }
      died.push(c.id);
    } else if (r.outcome === 'stable') {
      changes.push(`${c.displayName} ทอยเอาชีวิตรอด ${die} ผ่าน (${tally}) อาการทรงตัวแล้ว`);
    } else {
      changes.push(`${c.displayName} ทอยเอาชีวิตรอด ${die} ${r.outcome === 'pass' ? 'ผ่าน' : 'ล้มเหลว'} (${tally})`);
    }
    return updated;
  });
  return { characters: next, outcomes, changes, died, charmsSpent };
}

/** Anyone active again (revive, sanctuary, wipe, nat 20) starts fresh next time they fall. */
export function settleDeathSaves(characters: Character[]): Character[] {
  return characters.map((c) => (c.status === 'active' && c.deathSaves ? { ...c, deathSaves: null } : c));
}

/** Characters whose saved tally differs from what was loaded. */
export function changedDeathSaves(before: Character[], after: Character[]): Character[] {
  const old = new Map(before.map((c) => [c.id, JSON.stringify(c.deathSaves ?? null)]));
  return after.filter((c) => JSON.stringify(c.deathSaves ?? null) !== old.get(c.id));
}
