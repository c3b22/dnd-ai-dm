import type { CharacterTag, EnemyHurtTier, EnemyTier } from '@/lib/character/tags';

export type EncounterEnemy = {
  name: string;
  tier: EnemyTier;
  pip: number;
  maxPip: number;
  fled: boolean;
};

export type Encounter = { enemies: EncounterEnemy[] };

export const MAX_ENEMIES = 8;

const TIER_PIPS: Record<EnemyTier, number> = { minion: 1, normal: 2, strong: 3, boss: 5 };
const HURT_PIPS: Record<EnemyHurtTier, number> = { light: 1, medium: 1, heavy: 2 };

const isActive = (e: EncounterEnemy) => e.pip > 0 && !e.fled;
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
    const { name, tier, pip, maxPip, fled } = item as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim() === '' || seen.has(name)) return null;
    if (typeof tier !== 'string' || !Object.prototype.hasOwnProperty.call(TIER_PIPS, tier)) return null;
    const max = TIER_PIPS[tier as EnemyTier];
    if (maxPip !== max) return null;
    if (typeof pip !== 'number' || !Number.isInteger(pip) || pip < 0 || pip > max) return null;
    if (typeof fled !== 'boolean') return null;
    seen.add(name);
    enemies.push({ name, tier: tier as EnemyTier, pip, maxPip: max, fled });
  }
  const encounter = { enemies };
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
  for (const tag of tags) {
    if (tag.kind === 'combat_end') {
      enemies = null;
    } else if (tag.kind === 'enemy') {
      const list = enemies ?? [];
      if (list.length >= MAX_ENEMIES) continue;
      const name = uniqueName(tag.name, new Set(list.map((e) => e.name)));
      list.push({ name, tier: tag.tier, pip: TIER_PIPS[tag.tier], maxPip: TIER_PIPS[tag.tier], fled: false });
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
  const result = { enemies };
  return hasActive(result) ? result : null;
}
