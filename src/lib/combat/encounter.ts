import type { CharacterTag, EnemyTier } from '@/lib/character/tags';
import { BOSS_ONLY_TRAITS, ENEMY_TRAIT_IDS, MAX_ENEMY_TRAITS, REGEN_CALM_ROUNDS, HURT_PIPS, REGEN_PIPS, TIER_PIPS, type EnemyTrait } from './constants';

export type EncounterEnemy = {
  name: string;
  tier: EnemyTier;
  pip: number;
  maxPip: number;
  fled: boolean;
  /** I4: traits from the fixed list (missing in older encounters = none). */
  traits?: EnemyTrait[];
  /** I4: consecutive rounds this enemy was not hit (drives regenerating). */
  calm?: number;
};

export type Encounter = {
  enemies: EncounterEnemy[];
  /** I4: the fight round the players act in next (1 = the first). Missing in older encounters. */
  round?: number;
  /** I4: ids of players a venomous hit poisoned; they lose HP at the start of the next round. */
  poisoned?: string[];
};

export const hasTrait = (enemy: EncounterEnemy, trait: EnemyTrait): boolean => enemy.traits?.includes(trait) ?? false;
const isTrait = (v: unknown): v is EnemyTrait => typeof v === 'string' && (ENEMY_TRAIT_IDS as readonly string[]).includes(v);

/** Known traits only, no duplicates, at most MAX_ENEMY_TRAITS, boss-only ones dropped for other tiers. */
export function cleanTraits(raw: unknown, tier: EnemyTier): EnemyTrait[] {
  if (!Array.isArray(raw)) return [];
  const out: EnemyTrait[] = [];
  for (const t of raw) {
    if (!isTrait(t) || out.includes(t) || (tier !== 'boss' && BOSS_ONLY_TRAITS.includes(t))) continue;
    out.push(t);
  }
  return out.slice(0, MAX_ENEMY_TRAITS);
}

export const MAX_ENEMIES = 8;


const isActive = (e: EncounterEnemy) => e.pip > 0 && !e.fled;

/** Only fights with a live enemy whose trait depends on the fight round (fearsome, boss_signature) store a round counter, so other fights are never rewritten just to count. */
export const needsRound = (e: Encounter): boolean => e.enemies.some((x) => isActive(x) && (hasTrait(x, 'fearsome') || hasTrait(x, 'boss_signature')));
const hasActive = (e: Encounter) => e.enemies.some(isActive);

// Validates a jsonb value read from the database. Anything odd means "no encounter".
export function normalizeEncounter(value: unknown): Encounter | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as { enemies?: unknown }).enemies;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ENEMIES) return null;
  const enemies: EncounterEnemy[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { name, tier, pip, maxPip, fled, traits, calm } = item as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim() === '' || seen.has(name)) return null;
    if (typeof tier !== 'string' || !Object.prototype.hasOwnProperty.call(TIER_PIPS, tier)) return null;
    const max = TIER_PIPS[tier as EnemyTier];
    if (maxPip !== max) return null;
    if (typeof pip !== 'number' || !Number.isInteger(pip) || pip < 0 || pip > max) return null;
    if (typeof fled !== 'boolean') return null;
    seen.add(name);
    const cleaned = cleanTraits(traits, tier as EnemyTier);
    enemies.push({
      name, tier: tier as EnemyTier, pip, maxPip: max, fled,
      ...(cleaned.length > 0 ? { traits: cleaned } : {}),
      ...(typeof calm === 'number' && Number.isInteger(calm) && calm > 0 ? { calm } : {}),
    });
  }
  const { round, poisoned } = value as { round?: unknown; poisoned?: unknown };
  const ids = Array.isArray(poisoned) ? poisoned.filter((p): p is string => typeof p === 'string') : [];
  const encounter: Encounter = {
    enemies,
    ...(typeof round === 'number' && Number.isInteger(round) && round >= 1 ? { round } : {}),
    ...(ids.length > 0 ? { poisoned: ids } : {}),
  };
  return hasActive(encounter) ? encounter : null;
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Exact name first, otherwise the first live enemy sharing the base name (`หมาป่า` -> `หมาป่า 2`).
export function findActiveEnemy(enemies: EncounterEnemy[], name: string): EncounterEnemy | undefined {
  const exact = enemies.find((e) => e.name === name);
  if (exact && isActive(exact)) return exact;
  const prefix = `${name} `;
  return enemies.find((e) => isActive(e) && e.name.startsWith(prefix) && /^\d+$/.test(e.name.slice(prefix.length)));
}

/** Removes pips in place. A boss cannot be killed by a single blow from full health. */
export function damageEnemy(target: EncounterEnemy, pips: number): void {
  const wasFull = target.pip === target.maxPip;
  let next = Math.max(0, target.pip - pips);
  if (target.tier === 'boss' && wasFull) next = Math.max(1, next);
  target.pip = next;
}

// Pure: returns the new encounter, or null when there is none / it just ended.
export function applyEnemyTags(encounter: Encounter | null, tags: CharacterTag[]): Encounter | null {
  let enemies: EncounterEnemy[] | null = encounter ? encounter.enemies.map((e) => ({ ...e })) : null;
  const created = !encounter;
  for (const tag of tags) {
    if (tag.kind === 'combat_end') {
      enemies = null;
    } else if (tag.kind === 'enemy') {
      const list = enemies ?? [];
      if (list.length >= MAX_ENEMIES) continue;
      const name = uniqueName(tag.name, new Set(list.map((e) => e.name)));
      const traits = cleanTraits(tag.traits, tag.tier);
      list.push({ name, tier: tag.tier, pip: TIER_PIPS[tag.tier], maxPip: TIER_PIPS[tag.tier], fled: false, ...(traits.length > 0 ? { traits } : {}) });
      enemies = list;
    } else if (tag.kind === 'enemy_hurt' && enemies) {
      const target = findActiveEnemy(enemies, tag.name);
      if (!target) continue;
      damageEnemy(target, HURT_PIPS[tag.tier]);
    } else if (tag.kind === 'enemy_flee' && enemies) {
      const target = findActiveEnemy(enemies, tag.name);
      if (target) target.fled = true;
    }
  }
  if (!enemies) return null;
  const result: Encounter = { enemies, ...(encounter?.round !== undefined ? { round: encounter.round } : {}), ...(encounter?.poisoned ? { poisoned: encounter.poisoned } : {}) };
  if (created && !result.round && needsRound(result)) result.round = 1;
  return hasActive(result) ? result : null;
}

/**
 * I4: end-of-round bookkeeping, run once per processed round with the encounter as the round started
 * (`before`) and as the tags left it (`after`). Counts the fight round (a fight that began this round
 * stays at round 1; only counted while a fearsome / boss_signature enemy is alive, see needsRound), regenerating enemies that were not hit for REGEN_CALM_ROUNDS rounds recover REGEN_PIPS
 * (never above their starting pips), and records the players a venomous hit poisoned for the next round.
 */
export function advanceEncounter(before: Encounter | null, after: Encounter | null, poisonedIds: readonly string[] = []): Encounter | null {
  if (!after) return null;
  const prior = new Map((before?.enemies ?? []).map((e) => [e.name, e]));
  const enemies = after.enemies.map((e) => {
    const { calm: _old, ...plain } = e;
    void _old;
    const was = prior.get(e.name);
    if (!was || !isActive(e) || !hasTrait(e, 'regenerating')) return plain;
    const hit = e.pip < was.pip;
    let calm = hit ? 0 : (was.calm ?? 0) + 1;
    let pip = e.pip;
    if (!hit && calm >= REGEN_CALM_ROUNDS && pip < e.maxPip) {
      pip = Math.min(e.maxPip, pip + REGEN_PIPS);
      calm = 0;
    }
    return { ...plain, pip, ...(calm > 0 ? { calm } : {}) };
  });
  const ids = [...new Set(poisonedIds)];
  const { poisoned: _p, round: _r, ...rest } = after;
  void _p;
  void _r;
  const next: Encounter = { ...rest, enemies };
  if (needsRound(after)) next.round = before ? (before.round ?? 1) + 1 : (after.round ?? 1);
  if (ids.length > 0) next.poisoned = ids;
  return next;
}
