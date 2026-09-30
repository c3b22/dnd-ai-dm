# Character Status (HP, weapons, downed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player HP and a starting weapon, let the AI DM announce hits/heals/rescues through tags, and have the server roll and own every number, with a non-permanent "downed" state.

**Architecture:** Pure, dependency-injected rules modules in `src/lib/character/` (constants, dice, tag parsing, tag application, prompt block) are wired into the existing `processRound` pipeline and repository. Player state lives in new `players` columns, is read by `getRoundContext`, written after narration is posted, and surfaced to clients through the existing `players` realtime subscription plus a `stats` system message in the log.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Supabase (Postgres + RLS + Realtime), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-character-status-design.md` (agreed) and the approved prototype at `src/app/prototype/character-status/page.tsx` (variant A layout is implemented here; variant B is a possible follow-up).

**Spec deviation:** the `stats` system message stores `{ "type": "stats", "changes": string[] }` (plain Thai lines) instead of objects, because the log only renders text lines. Task 6 updates the spec sentence.

## Global Constraints

- TDD: write the failing test, run it and see it fail for the right reason, then implement. Tests: `npx vitest run <file>`; whole suite `npx vitest run`; types `npx tsc --noEmit` (tests are type-checked too).
- Next.js 15: `route.ts` files export **only** HTTP handlers; dynamic `params` are a `Promise`.
- **Never run `npm run build` or delete `.next` while the user's `npm run dev` is running** (they share `.next`). Verify with vitest + `tsc --noEmit`.
- Constants (exact values): `BASE_MAX_HP = 20`, `MIN_MAX_HP = 10`, `REVIVE_HP = 5`, revive n-th time since last sanctuary costs `2n` max HP, wipe costs `2n + 2` (n counted after incrementing), tiers `light 1d4`, `medium 1d6+1`, `heavy 2d6`, weapons `shortsword 1d8`, `shortbow 1d6`, `staff 1d4`, `fists 1d2` (null weapon = fists).
- Tags: `[[hurt: Name | light|medium|heavy]]`, `[[heal: Name | tier]]`, `[[revive: Name]]`, `[[sanctuary]]`; names match `display_name` case-insensitively; unknown or ambiguous names are ignored.
- Applying state is best-effort: a failure must never stop the round from closing.
- UI copy is Thai. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. **Commit steps run only after the user has approved this plan.**
- The Supabase migration is applied through the browser (SQL editor in the user's logged-in Chrome), never by asking the user to paste SQL.

## Review Focus

1. A tag with a valid name but an invalid tier (`[[hurt: Prem | huge]]`) must not apply and must not leak into the visible narration (Task 2).
2. Two players with the same display name (ambiguous) — the tag is ignored, the round does not fail (Task 3).
3. A round that produces no tags must still clear `pending_wipe` and must post no empty stats message (Tasks 6, 7).
4. Dice disabled in settings: no weapon damage is rolled, but tags still apply (Task 7).
5. Legacy players (weapon null, campaigns created before this feature) behave as bare hands and never crash prompt building (Tasks 1, 5).

---

### Task 1: Character constants, types and dice

**Files:**
- Create: `src/lib/character/types.ts`, `src/lib/character/constants.ts`, `src/lib/character/dice.ts`
- Test: `src/lib/character/constants.test.ts`, `src/lib/character/dice.test.ts`

**Interfaces:**
- Produces: `Character`, `CharacterStatus`; `BASE_MAX_HP`, `MIN_MAX_HP`, `REVIVE_HP`, `REVIVE_MAX_HP_STEP`, `WIPE_EXTRA_MAX_HP_PENALTY`; `DiceSpec`; `TIERS`, `Tier`; `WEAPONS`, `STARTING_WEAPON_IDS`, `DEFAULT_WEAPON_ID`, `isStartingWeapon(id): boolean`, `weaponFor(id): { id, nameTh, dice }`, `diceLabel(spec): string`; `rollDice(spec, rollDie)`, `randomDie(sides)`.

- [ ] **Step 1: Write the failing tests**

`src/lib/character/constants.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { weaponFor, isStartingWeapon, diceLabel, TIERS, DEFAULT_WEAPON_ID } from './constants';

describe('weaponFor', () => {
  it('returns the named weapon', () => {
    expect(weaponFor('shortbow')).toMatchObject({ id: 'shortbow', nameTh: 'ธนูสั้น' });
  });

  it('falls back to bare hands for null, unknown and prototype-key ids', () => {
    expect(weaponFor(null).id).toBe('fists');
    expect(weaponFor('lightsaber').id).toBe('fists');
    expect(weaponFor('constructor').id).toBe('fists');
  });
});

describe('isStartingWeapon', () => {
  it('accepts only the three starting weapons', () => {
    expect(isStartingWeapon('shortsword')).toBe(true);
    expect(isStartingWeapon('staff')).toBe(true);
    expect(isStartingWeapon('fists')).toBe(false);
    expect(isStartingWeapon(undefined)).toBe(false);
  });

  it('has a default that is itself a starting weapon', () => {
    expect(isStartingWeapon(DEFAULT_WEAPON_ID)).toBe(true);
  });
});

describe('diceLabel', () => {
  it('prints count, sides and bonus', () => {
    expect(diceLabel(TIERS.light)).toBe('1d4');
    expect(diceLabel(TIERS.medium)).toBe('1d6+1');
    expect(diceLabel(TIERS.heavy)).toBe('2d6');
  });
});
```

`src/lib/character/dice.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rollDice, randomDie } from './dice';

describe('rollDice', () => {
  it('sums each die plus the bonus', () => {
    const rolls = [3, 5];
    expect(rollDice({ count: 2, sides: 6, bonus: 1 }, () => rolls.shift()!)).toBe(9);
  });

  it('rolls the requested number of sides', () => {
    const seen: number[] = [];
    rollDice({ count: 1, sides: 8, bonus: 0 }, (sides) => {
      seen.push(sides);
      return 1;
    });
    expect(seen).toEqual([8]);
  });
});

describe('randomDie', () => {
  it('stays within 1..sides', () => {
    for (let i = 0; i < 200; i++) {
      const value = randomDie(4);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/character`
Expected: FAIL — cannot resolve `./constants` / `./dice`.

- [ ] **Step 3: Implement**

`src/lib/character/types.ts`:
```ts
export type CharacterStatus = 'active' | 'downed';

export interface Character {
  id: string;
  displayName: string;
  weaponId: string | null;
  hp: number;
  maxHp: number;
  status: CharacterStatus;
  revivesSinceSanctuary: number;
}
```

`src/lib/character/constants.ts`:
```ts
export const BASE_MAX_HP = 20;
/** max HP never drops below this, so nobody is stuck in a death spiral. */
export const MIN_MAX_HP = 10;
export const REVIVE_HP = 5;
/** The n-th revive since the last sanctuary costs n * this much max HP. */
export const REVIVE_MAX_HP_STEP = 2;
/** A whole-party wipe costs the revive price plus this. */
export const WIPE_EXTRA_MAX_HP_PENALTY = 2;

export interface DiceSpec {
  count: number;
  sides: number;
  bonus: number;
}

export const TIERS = {
  light: { count: 1, sides: 4, bonus: 0 },
  medium: { count: 1, sides: 6, bonus: 1 },
  heavy: { count: 2, sides: 6, bonus: 0 },
} as const satisfies Record<string, DiceSpec>;
export type Tier = keyof typeof TIERS;

export const WEAPONS = {
  shortsword: { nameTh: 'ดาบสั้น', dice: { count: 1, sides: 8, bonus: 0 } },
  shortbow: { nameTh: 'ธนูสั้น', dice: { count: 1, sides: 6, bonus: 0 } },
  staff: { nameTh: 'ไม้เท้า', dice: { count: 1, sides: 4, bonus: 0 } },
  fists: { nameTh: 'มือเปล่า', dice: { count: 1, sides: 2, bonus: 0 } },
} as const satisfies Record<string, { nameTh: string; dice: DiceSpec }>;
export type WeaponId = keyof typeof WEAPONS;

export const STARTING_WEAPON_IDS = ['shortsword', 'shortbow', 'staff'] as const;
export const DEFAULT_WEAPON_ID: (typeof STARTING_WEAPON_IDS)[number] = 'shortsword';

function isWeaponId(id: unknown): id is WeaponId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(WEAPONS, id);
}

export function isStartingWeapon(id: unknown): id is (typeof STARTING_WEAPON_IDS)[number] {
  return typeof id === 'string' && (STARTING_WEAPON_IDS as readonly string[]).includes(id);
}

export function weaponFor(id: string | null | undefined): { id: WeaponId; nameTh: string; dice: DiceSpec } {
  const key: WeaponId = isWeaponId(id) ? id : 'fists';
  return { id: key, ...WEAPONS[key] };
}

export function diceLabel(spec: DiceSpec): string {
  return `${spec.count}d${spec.sides}${spec.bonus ? `+${spec.bonus}` : ''}`;
}
```

`src/lib/character/dice.ts`:
```ts
import type { DiceSpec } from './constants';

export function rollDice(spec: DiceSpec, rollDie: (sides: number) => number): number {
  let total = spec.bonus;
  for (let i = 0; i < spec.count; i++) total += rollDie(spec.sides);
  return total;
}

export const randomDie = (sides: number): number => 1 + Math.floor(Math.random() * sides);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/character && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/character
git commit -m "feat(character): add HP/weapon constants, types and dice helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Character tag parsing

**Files:**
- Create: `src/lib/character/tags.ts`
- Test: `src/lib/character/tags.test.ts`

**Interfaces:**
- Consumes: `Tier` from `./constants`.
- Produces: `CharacterTag = { kind: 'hurt' | 'heal'; name: string; tier: Tier } | { kind: 'revive'; name: string } | { kind: 'sanctuary' }`; `parseCharacterTags(text): { tags: CharacterTag[]; cleanText: string }` (tags in order of appearance; every tag-shaped `[[hurt|heal|revive|sanctuary …]]` removed from `cleanText`, applied or not).

- [ ] **Step 1: Write the failing test**

`src/lib/character/tags.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCharacterTags } from './tags';

describe('parseCharacterTags', () => {
  it('extracts tags in the order they appear and strips them from the text', () => {
    const text = 'The goblin slashes Prem.\n[[hurt: Prem | medium]]\n[[revive: Suki]]\n[[sanctuary]]';
    expect(parseCharacterTags(text)).toEqual({
      tags: [
        { kind: 'hurt', name: 'Prem', tier: 'medium' },
        { kind: 'revive', name: 'Suki' },
        { kind: 'sanctuary' },
      ],
      cleanText: 'The goblin slashes Prem.',
    });
  });

  it('tolerates case and spacing, and keeps Thai names intact', () => {
    const { tags } = parseCharacterTags('[[ HEAL :  เปรม  |  Light ]]');
    expect(tags).toEqual([{ kind: 'heal', name: 'เปรม', tier: 'light' }]);
  });

  it('removes a tag with an invalid tier from the text without applying it', () => {
    const { tags, cleanText } = parseCharacterTags('Ouch.\n[[hurt: Prem | huge]]');
    expect(tags).toEqual([]);
    expect(cleanText).toBe('Ouch.');
  });

  it('leaves unrelated tags such as the scene tag alone', () => {
    const { tags, cleanText } = parseCharacterTags('Text\n[[scene: crypt]]');
    expect(tags).toEqual([]);
    expect(cleanText).toBe('Text\n[[scene: crypt]]');
  });

  it('returns the text unchanged when there are no tags', () => {
    expect(parseCharacterTags('Just narration.')).toEqual({ tags: [], cleanText: 'Just narration.' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/character/tags.test.ts`
Expected: FAIL — cannot resolve `./tags`.

- [ ] **Step 3: Implement**

`src/lib/character/tags.ts`:
```ts
import type { Tier } from './constants';

export type CharacterTag =
  | { kind: 'hurt' | 'heal'; name: string; tier: Tier }
  | { kind: 'revive'; name: string }
  | { kind: 'sanctuary' };

// One pattern for every valid tag so matches come back in reading order.
// Groups: 1 hurt|heal, 2 name, 3 tier, 4 revive name, 5 sanctuary.
const VALID_TAG =
  /\[\[\s*(?:(hurt|heal)\s*:\s*([^|\]]+?)\s*\|\s*(light|medium|heavy)|revive\s*:\s*([^\]]+?)|(sanctuary))\s*\]\]/gi;
// A tag-shaped leftover (bad tier, missing part): hidden from players, never applied.
const LEFTOVER_TAG = /\[\[\s*(?:hurt|heal|revive|sanctuary)\b[^\]]*\]\]/gi;

export function parseCharacterTags(text: string): { tags: CharacterTag[]; cleanText: string } {
  const tags: CharacterTag[] = [];
  for (const match of text.matchAll(VALID_TAG)) {
    if (match[1]) {
      tags.push({ kind: match[1].toLowerCase() as 'hurt' | 'heal', name: match[2].trim(), tier: match[3].toLowerCase() as Tier });
    } else if (match[4]) {
      tags.push({ kind: 'revive', name: match[4].trim() });
    } else {
      tags.push({ kind: 'sanctuary' });
    }
  }
  const cleanText = text.replace(VALID_TAG, '').replace(LEFTOVER_TAG, '').trimEnd();
  return { tags, cleanText };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/character/tags.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/character/tags.ts src/lib/character/tags.test.ts
git commit -m "feat(character): parse hurt/heal/revive/sanctuary tags from narration

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Applying tags (the rules engine)

**Files:**
- Create: `src/lib/character/applyTags.ts`
- Test: `src/lib/character/applyTags.test.ts`

**Interfaces:**
- Consumes: `Character` (types), `CharacterTag` (tags), `TIERS`, `BASE_MAX_HP`, `MIN_MAX_HP`, `REVIVE_HP`, `REVIVE_MAX_HP_STEP`, `WIPE_EXTRA_MAX_HP_PENALTY` (constants), `rollDice` (dice).
- Produces: `applyCharacterTags(characters: Character[], tags: CharacterTag[], rollDie: (sides: number) => number): { characters: Character[]; changes: string[]; wiped: boolean }`. Never mutates its input.

- [ ] **Step 1: Write the failing tests**

`src/lib/character/applyTags.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyCharacterTags } from './applyTags';
import type { Character } from './types';

const four = () => 4; // light 1d4 = 4, medium 1d6+1 = 5, heavy 2d6 = 8

function char(over: Partial<Character> = {}): Character {
  return { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, ...over };
}
const byName = (result: { characters: Character[] }, name: string) =>
  result.characters.find((c) => c.displayName === name)!;

describe('applyCharacterTags', () => {
  it('hurts by the rolled tier, reports it, and does not mutate the input', () => {
    const input = [char()];
    const result = applyCharacterTags(input, [{ kind: 'hurt', name: 'prem', tier: 'medium' }], four);
    expect(byName(result, 'Prem').hp).toBe(15);
    expect(result.changes).toEqual(['Prem −5 HP']);
    expect(input[0].hp).toBe(20);
  });

  it('downs a player who reaches 0 and never goes below 0', () => {
    const party = [char({ hp: 5 }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ hp: 0, status: 'downed' });
    expect(result.changes).toEqual(['Prem −8 HP', 'Prem ล้มลง']);
  });

  it('ignores hurt and heal on a downed player', () => {
    const party = [char({ hp: 0, status: 'downed' }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(
      party,
      [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }, { kind: 'heal', name: 'Prem', tier: 'heavy' }],
      four
    );
    expect(byName(result, 'Prem')).toMatchObject({ hp: 0, status: 'downed' });
    expect(result.changes).toEqual([]);
  });

  it('heals up to max HP and reports only what was actually gained', () => {
    const result = applyCharacterTags([char({ hp: 18 })], [{ kind: 'heal', name: 'Prem', tier: 'heavy' }], four);
    expect(byName(result, 'Prem').hp).toBe(20);
    expect(result.changes).toEqual(['Prem +2 HP']);
  });

  it('revives a downed player at 5 HP and escalates the max HP cost: −2, −4, −6', () => {
    const party = [char({ hp: 0, status: 'downed' }), char({ id: 'p2', displayName: 'Suki' })];
    const first = applyCharacterTags(party, [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(first, 'Prem')).toMatchObject({ hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 });
    expect(first.changes).toEqual(['Prem ฟื้นขึ้นมา (max HP −2)']);

    const downedAgain = first.characters.map((c) => (c.displayName === 'Prem' ? { ...c, hp: 0, status: 'downed' as const } : c));
    const second = applyCharacterTags(downedAgain, [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(second, 'Prem')).toMatchObject({ hp: 5, maxHp: 14, revivesSinceSanctuary: 2 });
  });

  it('never lets max HP fall below 10', () => {
    const party = [char({ hp: 0, status: 'downed', maxHp: 11, revivesSinceSanctuary: 2 }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(party, [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 10, hp: 5 });
  });

  it('ignores revive on a player who is standing', () => {
    const result = applyCharacterTags([char()], [{ kind: 'revive', name: 'Prem' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 20, revivesSinceSanctuary: 0 });
    expect(result.changes).toEqual([]);
  });

  it('sanctuary restores max HP and the revive counter for everyone but does not revive the downed', () => {
    const party = [
      char({ maxHp: 14, hp: 9, revivesSinceSanctuary: 2 }),
      char({ id: 'p2', displayName: 'Suki', maxHp: 18, hp: 0, status: 'downed', revivesSinceSanctuary: 1 }),
    ];
    const result = applyCharacterTags(party, [{ kind: 'sanctuary' }], four);
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 20, revivesSinceSanctuary: 0, hp: 9 });
    expect(byName(result, 'Suki')).toMatchObject({ maxHp: 20, revivesSinceSanctuary: 0, status: 'downed', hp: 0 });
  });

  it('ignores unknown names and ambiguous names (two players with the same name)', () => {
    const party = [char({ id: 'p1' }), char({ id: 'p2' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }, { kind: 'hurt', name: 'Nobody', tier: 'heavy' }], four);
    expect(result.characters.map((c) => c.hp)).toEqual([20, 20]);
    expect(result.changes).toEqual([]);
  });

  it('does not wipe while anyone is still standing', () => {
    const party = [char({ hp: 5 }), char({ id: 'p2', displayName: 'Suki' })];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }], four);
    expect(result.wiped).toBe(false);
    expect(byName(result, 'Prem').status).toBe('downed');
  });

  it('wipes when everyone is downed: half of the reduced max HP, cost 2n+2 counted per player', () => {
    const party = [
      char({ hp: 5 }),
      char({ id: 'p2', displayName: 'Suki', hp: 0, status: 'downed', revivesSinceSanctuary: 1, maxHp: 18 }),
    ];
    const result = applyCharacterTags(party, [{ kind: 'hurt', name: 'Prem', tier: 'heavy' }], four);
    expect(result.wiped).toBe(true);
    // Prem: counter 0→1, cost 4 → max 16, hp 8. Suki: counter 1→2, cost 6 → max 12, hp 6.
    expect(byName(result, 'Prem')).toMatchObject({ maxHp: 16, hp: 8, status: 'active', revivesSinceSanctuary: 1 });
    expect(byName(result, 'Suki')).toMatchObject({ maxHp: 12, hp: 6, status: 'active', revivesSinceSanctuary: 2 });
    expect(result.changes[result.changes.length - 1]).toContain('ล้มทั้งกลุ่ม');
  });

  it('never wipes an empty party', () => {
    expect(applyCharacterTags([], [], four)).toEqual({ characters: [], changes: [], wiped: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/character/applyTags.test.ts`
Expected: FAIL — cannot resolve `./applyTags`.

- [ ] **Step 3: Implement**

`src/lib/character/applyTags.ts`:
```ts
import {
  BASE_MAX_HP,
  MIN_MAX_HP,
  REVIVE_HP,
  REVIVE_MAX_HP_STEP,
  TIERS,
  WIPE_EXTRA_MAX_HP_PENALTY,
} from './constants';
import { rollDice } from './dice';
import type { CharacterTag } from './tags';
import type { Character } from './types';

export interface ApplyResult {
  characters: Character[];
  /** Thai lines for the game log, in the order things happened. */
  changes: string[];
  wiped: boolean;
}

export function applyCharacterTags(
  characters: Character[],
  tags: CharacterTag[],
  rollDie: (sides: number) => number
): ApplyResult {
  const next = characters.map((c) => ({ ...c }));
  const changes: string[] = [];

  // Unknown or ambiguous names resolve to null so a bad tag can never hit the wrong player.
  const find = (name: string): Character | null => {
    const matches = next.filter((c) => c.displayName.toLowerCase() === name.toLowerCase());
    return matches.length === 1 ? matches[0] : null;
  };

  for (const tag of tags) {
    if (tag.kind === 'sanctuary') {
      for (const c of next) {
        c.maxHp = BASE_MAX_HP;
        c.revivesSinceSanctuary = 0;
      }
      changes.push('ถึงสถานที่ปลอดภัย: max HP ของทุกคนกลับมาเต็ม');
      continue;
    }

    const target = find(tag.name);
    if (!target) continue;

    if (tag.kind === 'hurt' && target.status === 'active') {
      const damage = rollDice(TIERS[tag.tier], rollDie);
      target.hp = Math.max(0, target.hp - damage);
      changes.push(`${target.displayName} −${damage} HP`);
      if (target.hp === 0) {
        target.status = 'downed';
        changes.push(`${target.displayName} ล้มลง`);
      }
    } else if (tag.kind === 'heal' && target.status === 'active') {
      const gained = Math.min(target.maxHp - target.hp, rollDice(TIERS[tag.tier], rollDie));
      if (gained > 0) {
        target.hp += gained;
        changes.push(`${target.displayName} +${gained} HP`);
      }
    } else if (tag.kind === 'revive' && target.status === 'downed') {
      target.revivesSinceSanctuary += 1;
      const before = target.maxHp;
      target.maxHp = Math.max(MIN_MAX_HP, target.maxHp - REVIVE_MAX_HP_STEP * target.revivesSinceSanctuary);
      target.hp = Math.min(REVIVE_HP, target.maxHp);
      target.status = 'active';
      const lost = before - target.maxHp;
      changes.push(`${target.displayName} ฟื้นขึ้นมา${lost > 0 ? ` (max HP −${lost})` : ''}`);
    }
  }

  const wiped = next.length > 0 && next.every((c) => c.status === 'downed');
  if (wiped) {
    for (const c of next) {
      c.revivesSinceSanctuary += 1;
      const cost = REVIVE_MAX_HP_STEP * c.revivesSinceSanctuary + WIPE_EXTRA_MAX_HP_PENALTY;
      c.maxHp = Math.max(MIN_MAX_HP, c.maxHp - cost);
      c.hp = Math.ceil(c.maxHp / 2);
      c.status = 'active';
    }
    changes.push('ล้มทั้งกลุ่ม! ทุกคนฟื้นครึ่งหนึ่ง แต่ max HP ลดลงหนักและต้องแลกด้วยบทลงโทษในเรื่อง');
  }

  return { characters: next, changes, wiped };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/character && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/character/applyTags.ts src/lib/character/applyTags.test.ts
git commit -m "feat(character): apply hurt/heal/revive/sanctuary tags and party wipe

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Database migration and per-adventure sanctuaries

**Files:**
- Create: `supabase/migrations/0007_character_status.sql`, `src/lib/character/sanctuaries.ts`
- Test: `src/lib/character/sanctuaries.test.ts`

**Interfaces:**
- Produces: `sanctuaryFor(adventureId: string | null | undefined): string | undefined` (English description used in the prompt).

- [ ] **Step 1: Write the failing test**

`src/lib/character/sanctuaries.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sanctuaryFor } from './sanctuaries';
import { ADVENTURES } from '@/lib/adventures/adventures';

describe('sanctuaryFor', () => {
  it('defines a sanctuary for every adventure', () => {
    for (const adventure of ADVENTURES) {
      expect(sanctuaryFor(adventure.id), adventure.id).toBeTruthy();
    }
  });

  it('returns undefined for no adventure or an unknown one', () => {
    expect(sanctuaryFor(null)).toBeUndefined();
    expect(sanctuaryFor('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/character/sanctuaries.test.ts`
Expected: FAIL — cannot resolve `./sanctuaries`.

- [ ] **Step 3: Implement**

`src/lib/character/sanctuaries.ts`:
```ts
const SANCTUARIES: Record<string, string> = {
  'sunken-bell-of-marrowmere': "Brother Tolliver's empty chapel on the lakeshore",
  'the-wolf-king-of-ashenfell': "the hearth in Jarl Asgrim's longhall",
  'the-thousand-doors-market':
    "Ozric the Lantern-Seller's stall (narrate the healing as costing a small story favor, never a number)",
  'crown-of-the-sunken-king':
    'the tavern near Castle Dunmoor where the map was bought (leaving the dungeon to rest)',
};

/** Where the party may be fully restored in this adventure; the DM may tag `[[sanctuary]]` only there. */
export function sanctuaryFor(adventureId: string | null | undefined): string | undefined {
  return adventureId && Object.prototype.hasOwnProperty.call(SANCTUARIES, adventureId)
    ? SANCTUARIES[adventureId]
    : undefined;
}
```

`supabase/migrations/0007_character_status.sql`:
```sql
alter table players add column if not exists hp int not null default 20;
alter table players add column if not exists max_hp int not null default 20;
alter table players add column if not exists weapon_id text;
alter table players add column if not exists status text not null default 'active'
  check (status in ('active', 'downed'));
alter table players add column if not exists revives_since_sanctuary int not null default 0;

alter table campaigns add column if not exists pending_wipe boolean not null default false;

-- A downed player cannot act, even from a modified client.
drop policy if exists "players can submit only their own action" on round_actions;
create policy "players can submit only their own action"
  on round_actions for insert
  with check (
    exists (
      select 1 from players
      where players.id = round_actions.player_id
      and players.user_id = auth.uid()
      and players.status = 'active'
    )
  );
```

- [ ] **Step 4: Run to verify the test passes**

Run: `npx vitest run src/lib/character/sanctuaries.test.ts && npx tsc --noEmit`
Expected: PASS. (The migration is applied to the live project in Task 11, not here.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_character_status.sql src/lib/character/sanctuaries.ts src/lib/character/sanctuaries.test.ts
git commit -m "feat(character): add player status columns, downed-action RLS and sanctuaries

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Prompt — party status, tags rules, weapon damage, wipe aftermath

**Files:**
- Create: `src/lib/character/prompt.ts`
- Modify: `src/lib/round/assemblePrompt.ts`
- Test: `src/lib/character/prompt.test.ts`, `src/lib/round/assemblePrompt.test.ts` (append)

**Interfaces:**
- Consumes: `Character`, `weaponFor`, `diceLabel`, `sanctuaryFor`.
- Produces: `characterPrompt(characters: Character[], pendingWipe: boolean, sanctuary: string | undefined): string[]` (empty array when no characters); `RoundAction` gains `weaponLabel?: string` and `damage?: number`; `assemblePrompt(..., settings?, characterState?: { characters: Character[]; pendingWipe: boolean })`.

- [ ] **Step 1: Write the failing tests**

`src/lib/character/prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { characterPrompt } from './prompt';
import type { Character } from './types';

const party: Character[] = [
  { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 15, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 },
  { id: 'p2', displayName: 'Suki', weaponId: null, hp: 0, maxHp: 20, status: 'downed', revivesSinceSanctuary: 0 },
];

describe('characterPrompt', () => {
  it('is empty when there are no characters', () => {
    expect(characterPrompt([], false, 'a chapel')).toEqual([]);
  });

  it('lists each character with HP, weapon and standing/downed', () => {
    const text = characterPrompt(party, false, undefined).join('\n');
    expect(text).toContain('Prem: HP 15/18, shortsword (1d8), standing');
    expect(text).toContain('Suki: HP 0/20, fists (1d2), DOWNED');
  });

  it('teaches the tags and forbids inventing HP numbers', () => {
    const text = characterPrompt(party, false, undefined).join('\n');
    expect(text).toContain('[[hurt: PlayerName | light]]');
    expect(text).toContain('[[heal: PlayerName | medium]]');
    expect(text).toContain('[[revive: PlayerName]]');
    expect(text).toContain('never state or invent HP numbers');
  });

  it('names the sanctuary only when the adventure has one', () => {
    expect(characterPrompt(party, false, 'the old chapel').join('\n')).toContain('[[sanctuary]] only when the party is at: the old chapel');
    expect(characterPrompt(party, false, undefined).join('\n')).not.toContain('[[sanctuary]]');
  });

  it('adds the aftermath instruction only after a wipe', () => {
    expect(characterPrompt(party, true, undefined).join('\n')).toContain('defeated last round');
    expect(characterPrompt(party, false, undefined).join('\n')).not.toContain('defeated last round');
  });
});
```

Append to `src/lib/round/assemblePrompt.test.ts` (inside a new `describe` at the end of the file):
```ts
describe('assemblePrompt with characters', () => {
  const characters = [
    { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 },
  ];

  it('includes the party status block when characters are given', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Attack' }], 'sunken-bell-of-marrowmere', null, undefined, {
      characters,
      pendingWipe: false,
    });
    expect(prompt).toContain('Prem: HP 20/20, shortsword (1d8), standing');
    expect(prompt).toContain("Brother Tolliver's empty chapel");
  });

  it('shows the weapon damage roll next to the d20 when one was rolled', () => {
    const prompt = assemblePrompt('', [], [
      { playerDisplayName: 'Prem', actionText: 'Attack', roll: 14, weaponLabel: 'shortsword', damage: 5 },
    ]);
    expect(prompt).toContain('Prem (rolled 14 on a d20, shortsword damage roll 5): Attack');
  });

  it('keeps the old action format when there is no weapon damage', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look', roll: 9 }]);
    expect(prompt).toContain('Prem (rolled 9 on a d20): Look');
  });

  it('adds no party block when no character state is passed', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }]);
    expect(prompt).not.toContain('Party status');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/character/prompt.test.ts src/lib/round/assemblePrompt.test.ts`
Expected: FAIL — `./prompt` missing; new assemblePrompt cases fail (no party block, no damage text).

- [ ] **Step 3: Implement**

`src/lib/character/prompt.ts`:
```ts
import { diceLabel, weaponFor } from './constants';
import type { Character } from './types';

export function characterPrompt(
  characters: Character[],
  pendingWipe: boolean,
  sanctuary: string | undefined
): string[] {
  if (characters.length === 0) return [];

  const lines = [
    'Party status (managed by the game server; never state or invent HP numbers yourself):',
    ...characters.map((c) => {
      const weapon = weaponFor(c.weaponId);
      const state =
        c.status === 'downed'
          ? "DOWNED (cannot act; only a teammate's action can get them back up)"
          : 'standing';
      return `- ${c.displayName}: HP ${c.hp}/${c.maxHp}, ${weapon.id} (${diceLabel(weapon.dice)}), ${state}`;
    }),
    '',
    'Announce mechanical outcomes with tags, each on its own line after your narration. The server rolls the numbers:',
    '  [[hurt: PlayerName | light]] - that player was hurt (use light, medium or heavy by how bad the hit is)',
    '  [[heal: PlayerName | medium]] - that player recovered health (light, medium or heavy)',
    '  [[revive: PlayerName]] - a downed player was helped back up by a teammate',
    ...(sanctuary
      ? [`  [[sanctuary]] only when the party is at: ${sanctuary}. Never use it anywhere else.`]
      : []),
    'Use the exact player name. Do not tag actions that had no mechanical effect.',
  ];

  if (pendingWipe) {
    lines.push(
      '',
      'The whole party was defeated last round. Narrate how they survived and impose exactly one concrete story consequence (captured, lost something valuable, or the antagonist advances).'
    );
  }
  return lines;
}
```

Modify `src/lib/round/assemblePrompt.ts`:

1. Imports (top of file, after the settings import):
```ts
import { characterPrompt } from '@/lib/character/prompt';
import { sanctuaryFor } from '@/lib/character/sanctuaries';
import type { Character } from '@/lib/character/types';
```
2. `RoundAction` gets two fields:
```ts
export interface RoundAction {
  playerDisplayName: string;
  actionText: string;
  /** d20 the server rolled for this action; the DM must respect it. */
  roll?: number;
  /** Weapon the acting character wields and the damage the server rolled for it. */
  weaponLabel?: string;
  damage?: number;
}
```
3. Signature gets the last parameter:
```ts
  settings: CampaignSettings = DEFAULT_SETTINGS,
  characterState?: { characters: Character[]; pendingWipe: boolean }
): string {
```
4. Replace the `rolled` line inside `actions.map`:
```ts
      const damage = a.damage === undefined ? '' : `, ${a.weaponLabel ?? 'weapon'} damage roll ${a.damage}`;
      const rolled = a.roll === undefined ? '' : ` (rolled ${a.roll} on a d20${damage})`;
```
5. Insert the party block before the actions heading: change
```ts
    "This round's player actions" + (inOrder ? ' (listed in the order the players chose):' : ':'),
```
to be preceded by:
```ts
    ...(characterState
      ? (() => {
          const block = characterPrompt(
            characterState.characters,
            characterState.pendingWipe,
            sanctuaryFor(adventureId)
          );
          return block.length ? [...block, ''] : [];
        })()
      : []),
```
(placed immediately after the `historyText || '(no recent messages)'` line and its trailing `''`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/character/prompt.test.ts src/lib/round/assemblePrompt.test.ts && npx tsc --noEmit`
Expected: PASS (all pre-existing assemblePrompt tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/character/prompt.ts src/lib/character/prompt.test.ts src/lib/round/assemblePrompt.ts src/lib/round/assemblePrompt.test.ts
git commit -m "feat(round): tell the DM about party status, weapon damage and tag rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Repository — read characters, save state, post stats

**Files:**
- Modify: `src/lib/round/roundRepository.ts`, `docs/superpowers/specs/2026-09-30-character-status-design.md` (one sentence)
- Test: `src/lib/round/roundRepository.test.ts` (append + extend fake)

**Interfaces:**
- Consumes: `Character` (types).
- Produces: `RoundContext` gains `characters: Character[]` and `pendingWipe: boolean`; `RoundRepository` gains `saveCharacterState(campaignId: string, characters: Character[], pendingWipe: boolean): Promise<void>` and `insertStatsSummary(campaignId: string, roundId: string, changes: string[]): Promise<void>` (no-op for an empty list; stores `JSON.stringify({ type: 'stats', changes })` as a `system` message).

- [ ] **Step 1: Write the failing tests**

In `src/lib/round/roundRepository.test.ts`, extend `createFakeSupabase`:

a. Add `players?: unknown[]; pendingWipe?: boolean;` to the `options` type.
b. In the `campaigns` branch, return `{ adventure_id: 'test-adventure', pending_wipe: options.pendingWipe ?? false }`.
c. Add a `players` branch before the `messages` branch:
```ts
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: options.players ?? [], error: null }),
          }),
        };
      }
```
Append these tests at the end of the file:
```ts
describe('createSupabaseRoundRepository character state', () => {
  it('reads the characters and the pending wipe flag into the round context', async () => {
    const { client } = createFakeSupabase({
      roundsById: { 'round-1': { campaign_id: 'camp-1' } },
      campaignSummary: null,
      pendingWipe: true,
      players: [
        { id: 'p1', display_name: 'Prem', weapon_id: 'staff', hp: 12, max_hp: 18, status: 'downed', revives_since_sanctuary: 1 },
      ],
    });

    const context = await createSupabaseRoundRepository(client).getRoundContext('round-1');

    expect(context.pendingWipe).toBe(true);
    expect(context.characters).toEqual([
      { id: 'p1', displayName: 'Prem', weaponId: 'staff', hp: 12, maxHp: 18, status: 'downed', revivesSinceSanctuary: 1 },
    ]);
  });

  it('saves every character row and the wipe flag', async () => {
    const updates: { table: string; payload: unknown; id: string }[] = [];
    const client: any = {
      from: (table: string) => ({
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => {
            updates.push({ table, payload, id });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    await createSupabaseRoundRepository(client).saveCharacterState(
      'camp-1',
      [{ id: 'p1', displayName: 'Prem', weaponId: 'staff', hp: 5, maxHp: 18, status: 'active', revivesSinceSanctuary: 1 }],
      true
    );

    expect(updates).toEqual([
      { table: 'players', payload: { hp: 5, max_hp: 18, status: 'active', revives_since_sanctuary: 1 }, id: 'p1' },
      { table: 'campaigns', payload: { pending_wipe: true }, id: 'camp-1' },
    ]);
  });

  it('posts the changes as a stats system message, and nothing when there are none', async () => {
    const inserted: unknown[] = [];
    const client: any = {
      from: () => ({
        insert: (payload: unknown) => {
          inserted.push(payload);
          return Promise.resolve({ error: null });
        },
      }),
    };
    const repository = createSupabaseRoundRepository(client);

    await repository.insertStatsSummary('camp-1', 'round-1', []);
    expect(inserted).toEqual([]);

    await repository.insertStatsSummary('camp-1', 'round-1', ['Prem −5 HP']);
    expect(inserted).toEqual([
      {
        campaign_id: 'camp-1',
        round_id: 'round-1',
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes: ['Prem −5 HP'] }),
      },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/round/roundRepository.test.ts`
Expected: FAIL — `context.characters` undefined, `saveCharacterState` / `insertStatsSummary` not functions.

- [ ] **Step 3: Implement**

In `src/lib/round/roundRepository.ts`:

1. Add import: `import type { Character } from '@/lib/character/types';`
2. `RoundContext` gets:
```ts
  characters: Character[];
  pendingWipe: boolean;
```
3. `RoundRepository` interface gets:
```ts
  saveCharacterState(campaignId: string, characters: Character[], pendingWipe: boolean): Promise<void>;
  insertStatsSummary(campaignId: string, roundId: string, changes: string[]): Promise<void>;
```
4. In `getRoundContext`, after the `settingsRow` query add (separate queries so a database without the new columns still plays):
```ts
      const { data: characterRows } = await supabase
        .from('players')
        .select('id, display_name, weapon_id, hp, max_hp, status, revives_since_sanctuary')
        .eq('campaign_id', campaignId);

      const { data: wipeRow } = await supabase
        .from('campaigns')
        .select('pending_wipe')
        .eq('id', campaignId)
        .maybeSingle();
```
and in the returned object:
```ts
        characters: (characterRows ?? []).map((row: any) => ({
          id: row.id as string,
          displayName: row.display_name as string,
          weaponId: (row.weapon_id ?? null) as string | null,
          hp: row.hp as number,
          maxHp: row.max_hp as number,
          status: row.status as 'active' | 'downed',
          revivesSinceSanctuary: row.revives_since_sanctuary as number,
        })),
        pendingWipe: Boolean(wipeRow?.pending_wipe),
```
5. Add the two methods after `insertRollSummary`:
```ts
    async saveCharacterState(campaignId, characters, pendingWipe) {
      for (const c of characters) {
        const { error } = await supabase
          .from('players')
          .update({
            hp: c.hp,
            max_hp: c.maxHp,
            status: c.status,
            revives_since_sanctuary: c.revivesSinceSanctuary,
          })
          .eq('id', c.id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from('campaigns')
        .update({ pending_wipe: pendingWipe })
        .eq('id', campaignId);
      if (error) throw error;
    },

    async insertStatsSummary(campaignId, roundId, changes) {
      if (changes.length === 0) return;
      const { error } = await supabase.from('messages').insert({
        campaign_id: campaignId,
        round_id: roundId,
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes }),
      });
      if (error) throw error;
    },
```
6. In `docs/superpowers/specs/2026-09-30-character-status-design.md`, change the sentence containing `{ "type": "stats", "changes": [{ "playerDisplayName", "text" }] }` to `{ "type": "stats", "changes": string[] }` (plain Thai lines).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/round/roundRepository.test.ts && npx tsc --noEmit`
Expected: roundRepository tests PASS. `tsc` will fail in `processRound.test.ts` mocks (missing new interface members and context fields) — that is fixed in Task 7; if `tsc` reports errors only in `src/lib/round/processRound*.ts` files, continue.

- [ ] **Step 5: Commit**

```bash
git add src/lib/round/roundRepository.ts src/lib/round/roundRepository.test.ts docs/superpowers/specs/2026-09-30-character-status-design.md
git commit -m "feat(round): read and save character state in the round repository

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: processRound integration

**Files:**
- Modify: `src/lib/round/processRound.ts`
- Test: `src/lib/round/processRound.test.ts`

**Interfaces:**
- Consumes: `parseCharacterTags`, `applyCharacterTags`, `weaponFor`, `rollDice`, `randomDie`, `assemblePrompt(..., characterState)`, the new repository methods and context fields.
- Produces: `ProcessRoundDeps` gains `rollSides?: (sides: number) => number` (default `randomDie`).

- [ ] **Step 1: Update the fakes and write the failing tests**

In `src/lib/round/processRound.test.ts`:

a. In `createFakeRepository`, add to the default `getRoundContext` value `characters: [], pendingWipe: false,` and add to the returned object:
```ts
    saveCharacterState: vi.fn().mockResolvedValue(undefined),
    insertStatsSummary: vi.fn().mockResolvedValue(undefined),
```
b. In the two other `getRoundContext: vi.fn().mockResolvedValue({ ... })` blocks (the `longHistoryRepository` one and the second one used by the scene test — search for `getRoundContext:` to find all three), add `characters: [], pendingWipe: false,` to the resolved object.
c. Append this `describe` at the end of the file:
```ts
describe('processRound character status', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };

  function repoWith(characters: unknown[], extra: Record<string, unknown> = {}) {
    return createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        campaignSummary: '',
        recentMessages: [],
        actions: [{ playerDisplayName: 'Prem', actionText: 'Attack' }],
        characters,
        pendingWipe: false,
        ...extra,
      }),
    });
  }
  const deps = (repository: RoundRepository, narration: string[], extra: Partial<ProcessRoundDeps> = {}): ProcessRoundDeps => ({
    claimRound: vi.fn().mockResolvedValue(true),
    repository,
    generateNarration: vi.fn().mockResolvedValue(fakeStream(narration)),
    rollDie: () => 14,
    rollSides: () => 4,
    ...extra,
  });

  it('rolls the acting weapon damage and tells the DM', async () => {
    const repository = repoWith([prem]);
    const d = deps(repository, ['Narration.']);

    await processRound(d, 'round-1');

    expect((d.generateNarration as any).mock.calls[0][0]).toContain(
      'Prem (rolled 14 on a d20, shortsword damage roll 4): Attack'
    );
  });

  it('strips the tags from the posted narration, applies them and posts the stats line', async () => {
    const repository = repoWith([prem]);

    await processRound(deps(repository, ['Goblin hits.\n[[hurt: Prem | heavy]]\n[[scene: crypt]]']), 'round-1');

    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'Goblin hits.');
    expect(repository.saveCharacterState).toHaveBeenCalledWith(
      'camp-1',
      [expect.objectContaining({ id: 'p1', hp: 12 })],
      false
    );
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem −8 HP']);
  });

  it('records a party wipe so the next round narrates the aftermath', async () => {
    const repository = repoWith([{ ...prem, hp: 5 }]);

    await processRound(deps(repository, ['Down.\n[[hurt: Prem | heavy]]']), 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ status: 'active', maxHp: 16, hp: 8 })], true);
  });

  it('clears the wipe flag and posts no stats when nothing happened', async () => {
    const repository = repoWith([prem], { pendingWipe: true });

    await processRound(deps(repository, ['A quiet round.']), 'round-1');

    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ hp: 20 })], false);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', []);
  });

  it('puts the aftermath instruction in the prompt while a wipe is pending', async () => {
    const repository = repoWith([prem], { pendingWipe: true });
    const d = deps(repository, ['ok']);

    await processRound(d, 'round-1');

    expect((d.generateNarration as any).mock.calls[0][0]).toContain('defeated last round');
  });

  it('still applies tags when dice are disabled, but rolls no weapon damage', async () => {
    const repository = repoWith([prem], { settings: { diceEnabled: false } });
    const d = deps(repository, ['Hit.\n[[hurt: Prem | light]]']);

    await processRound(d, 'round-1');

    expect((d.generateNarration as any).mock.calls[0][0]).not.toContain('damage roll');
    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ hp: 16 })], false);
  });

  it('still closes the round when saving character state fails', async () => {
    const repository = repoWith([prem]);
    (repository.saveCharacterState as any).mockRejectedValue(new Error('db down'));

    const result = await processRound(deps(repository, ['Hit.\n[[hurt: Prem | light]]']), 'round-1');

    expect(result.processed).toBe(true);
    expect(repository.closeRoundAndOpenNext).toHaveBeenCalled();
  });

  it('does nothing about characters when the campaign has none', async () => {
    const repository = repoWith([]);

    await processRound(deps(repository, ['Plain.']), 'round-1');

    expect(repository.saveCharacterState).not.toHaveBeenCalled();
    expect(repository.insertStatsSummary).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/round/processRound.test.ts`
Expected: the new tests FAIL (no damage text, tags not stripped, no `saveCharacterState` call); older tests still pass.

- [ ] **Step 3: Implement**

In `src/lib/round/processRound.ts`:

1. Imports:
```ts
import { parseCharacterTags } from '@/lib/character/tags';
import { applyCharacterTags } from '@/lib/character/applyTags';
import { weaponFor } from '@/lib/character/constants';
import { randomDie, rollDice } from '@/lib/character/dice';
```
2. `ProcessRoundDeps` gets:
```ts
  /** Rolls one die with the given number of sides (weapon and tier damage). Injectable for tests. */
  rollSides?: (sides: number) => number;
```
3. Replace the `rolled = context.actions.map(...)` line with:
```ts
    const rollSides = deps.rollSides ?? randomDie;
    const characterByName = new Map(context.characters.map((c) => [c.displayName.toLowerCase(), c]));
    rolled = context.actions.map((a) => {
      if (!diceEnabled) return { ...a };
      const roll = rollDie();
      const character = characterByName.get(a.playerDisplayName.toLowerCase());
      if (!character) return { ...a, roll };
      const weapon = weaponFor(character.weaponId);
      return { ...a, roll, weaponLabel: weapon.id, damage: rollDice(weapon.dice, rollSides) };
    });
```
(`rolled`'s declared element type must include the new optional fields: change its declaration to `let rolled: RoundAction[];` and add `import type { RoundAction } from './assemblePrompt';` — `assemblePrompt` is already imported from that module, so extend that import.)
4. Pass the character state to the prompt: append `, { characters: context.characters, pendingWipe: context.pendingWipe }` as the last argument of the `assemblePrompt(...)` call.
5. Replace the two lines that parse the narration:
```ts
  let narration = '';
  for await (const chunk of stream) narration += chunk;
  const { tags, cleanText: withoutCharacterTags } = parseCharacterTags(narration);
  const { sceneId, cleanText } = parseSceneTag(withoutCharacterTags);
```
(the existing `if (cleanText.trim()) await ...appendToMessage(...)` and scene handling stay as they are).
6. Before `const nextRoundId = await deps.repository.closeRoundAndOpenNext(...)`, insert:
```ts
  // Best-effort like the scene change: a failure here must never leave the table stuck.
  if (context.characters.length > 0) {
    try {
      const result = applyCharacterTags(context.characters, tags, deps.rollSides ?? randomDie);
      await deps.repository.saveCharacterState(context.campaignId, result.characters, result.wiped);
      await deps.repository.insertStatsSummary(context.campaignId, roundId, result.changes);
    } catch {
      /* the narration is already posted; the next round reads whatever state was saved */
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run && npx tsc --noEmit`
Expected: whole suite PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/round/processRound.ts src/lib/round/processRound.test.ts
git commit -m "feat(round): roll weapon damage, apply character tags and post stats each round

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Choose a starting weapon when creating or joining a room

**Files:**
- Create: `src/components/WeaponPicker.tsx`
- Modify: `src/lib/campaign/createCampaign.ts`, `src/lib/campaign/joinCampaign.ts`, `src/app/page.tsx`, `src/app/join/[campaignId]/page.tsx`, `src/app/api/campaigns/[id]/join/route.ts`, `src/app/globals.css`
- Test: `src/components/WeaponPicker.test.tsx`, `src/lib/campaign/joinCampaign.test.ts`, `src/app/api/campaigns/route.test.ts`

**Interfaces:**
- Consumes: `STARTING_WEAPON_IDS`, `DEFAULT_WEAPON_ID`, `isStartingWeapon`, `weaponFor`, `diceLabel`.
- Produces: `WeaponPicker({ value: string; onChange: (id: string) => void })`; `createCampaign` and `joinCampaign` params accept `weaponId?: string` (invalid or missing → `DEFAULT_WEAPON_ID`).

- [ ] **Step 1: Write the failing tests**

`src/components/WeaponPicker.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeaponPicker } from './WeaponPicker';

describe('WeaponPicker', () => {
  it('offers the three starting weapons with their damage dice and marks the chosen one', () => {
    render(<WeaponPicker value="shortbow" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: /ดาบสั้น/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /ธนูสั้น/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /ไม้เท้า/ })).toBeInTheDocument();
    expect(screen.getByText(/1d8/)).toBeInTheDocument();
  });

  it('reports the weapon id that was picked', () => {
    const onChange = vi.fn();
    render(<WeaponPicker value="shortsword" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /ไม้เท้า/ }));

    expect(onChange).toHaveBeenCalledWith('staff');
  });
});
```

In `src/lib/campaign/joinCampaign.test.ts`: change the first test's expected insert payload to include `weapon_id: 'shortsword'`, pass `weaponId: 'staff'` in a new test:
```ts
  it('stores the chosen starting weapon and falls back to the default for anything else', async () => {
    const chosen = fakeSupabase({ existing: null });
    await joinCampaign(chosen.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'staff' });
    expect(chosen.inserts).toEqual([{ campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'staff' }]);

    const invalid = fakeSupabase({ existing: null });
    await joinCampaign(invalid.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'lightsaber' });
    expect(invalid.inserts).toEqual([{ campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'shortsword' }]);
  });
```
(and update the existing first test's `toEqual([...])` to include `weapon_id: 'shortsword'`).

In `src/app/api/campaigns/route.test.ts`, add inside the `describe('createCampaign', …)` block (it reuses the file's `createFakeSupabase`, which records insert payloads in `calls`):
```ts
  it('stores the chosen starting weapon on the creator, defaulting to the shortsword', async () => {
    const responses = {
      campaigns: { id: 'camp-1', name: 'Test' },
      players: { id: 'player-1', campaign_id: 'camp-1' },
      rounds: { id: 'round-1', campaign_id: 'camp-1', status: 'pending' },
    };
    const playerInsert = (calls: { table: string; action: string; payload?: unknown }[]) =>
      calls.find((c) => c.action === 'insert' && c.table === 'players')?.payload as { weapon_id: string };

    const chosen = createFakeSupabase(responses);
    await createCampaign(chosen.client, { name: 'Test', userId: 'user-1', displayName: 'Prem', weaponId: 'shortbow' });
    expect(playerInsert(chosen.calls).weapon_id).toBe('shortbow');

    const fallback = createFakeSupabase(responses);
    await createCampaign(fallback.client, { name: 'Test', userId: 'user-1', displayName: 'Prem' });
    expect(playerInsert(fallback.calls).weapon_id).toBe('shortsword');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/WeaponPicker.test.tsx src/lib/campaign/joinCampaign.test.ts src/app/api/campaigns/route.test.ts`
Expected: FAIL — `WeaponPicker` missing; payloads lack `weapon_id`.

- [ ] **Step 3: Implement**

`src/components/WeaponPicker.tsx`:
```tsx
import { STARTING_WEAPON_IDS, diceLabel, weaponFor } from '@/lib/character/constants';

export interface WeaponPickerProps {
  value: string;
  onChange: (weaponId: string) => void;
}

export function WeaponPicker({ value, onChange }: WeaponPickerProps) {
  return (
    <fieldset className="wp-list">
      <legend className="lede">อาวุธเริ่มต้น (ทุกคนเริ่มที่ 20 HP)</legend>
      {STARTING_WEAPON_IDS.map((id) => {
        const weapon = weaponFor(id);
        return (
          <button
            type="button"
            key={id}
            className="adv wp-item"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <span className="t">{weapon.nameTh}</span>
            <span className="d">ดาเมจ {diceLabel(weapon.dice)}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
```

`src/lib/campaign/joinCampaign.ts`: add `weaponId?: string` to the params type, import `DEFAULT_WEAPON_ID, isStartingWeapon` from `@/lib/character/constants`, and in the insert add
```ts
      weapon_id: isStartingWeapon(params.weaponId) ? params.weaponId : DEFAULT_WEAPON_ID,
```

`src/lib/campaign/createCampaign.ts`: params type gets `weaponId?: string`; the `players` insert gets the same `weapon_id` line (same imports).

`src/app/api/campaigns/[id]/join/route.ts`: pass `weaponId: body.weaponId` in the `joinCampaign(...)` call. (`/api/campaigns/route.ts` already forwards the whole body to `createCampaign`.)

`src/app/page.tsx` (three edits):
```tsx
import { WeaponPicker } from '@/components/WeaponPicker';
import { DEFAULT_WEAPON_ID } from '@/lib/character/constants';
// inside Home(), next to the other useState calls:
const [weaponId, setWeaponId] = useState<string>(DEFAULT_WEAPON_ID);
// in handleCreate:
body: JSON.stringify({ name, userId: user.id, displayName, adventureId, weaponId }),
```
and insert this element immediately after the closing `</div>` of the display-name `<div className="field">` (the block whose input has `onChange={(e) => setDisplayName(e.target.value)}`), before the submit button:
```tsx
          <WeaponPicker value={weaponId} onChange={setWeaponId} />
```

`src/app/join/[campaignId]/page.tsx` (same three edits):
```tsx
import { WeaponPicker } from '@/components/WeaponPicker';
import { DEFAULT_WEAPON_ID } from '@/lib/character/constants';
// inside JoinPage(), next to the other useState calls (add useState to the react import if missing — it is already imported):
const [weaponId, setWeaponId] = useState<string>(DEFAULT_WEAPON_ID);
// in handleJoin:
body: JSON.stringify({ userId: user.id, displayName, weaponId }),
```
and insert `<WeaponPicker value={weaponId} onChange={setWeaponId} />` right after the closing `</div>` of the display-name `<div className="field">`, before the submit button.

`src/app/globals.css` (append near the other component styles):
```css
.wp-list { border: 0; padding: 0; margin: 12px 0; display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.wp-item { text-align: left; padding: 10px 12px; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WeaponPicker.tsx src/components/WeaponPicker.test.tsx src/lib/campaign src/app/page.tsx "src/app/join/[campaignId]/page.tsx" "src/app/api/campaigns" src/app/globals.css
git commit -m "feat(character): choose a starting weapon when creating or joining a room

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Show HP, weapon and downed state to players (variant A) and count only standing players

**Files:**
- Create: `src/components/HpBar.tsx`
- Modify: `src/lib/supabase/players.ts`, `src/lib/supabase/roundActionsRealtime.ts`, `src/components/PlayerOrder.tsx`, `src/components/PlayerOrder.test.tsx`, `src/components/CampaignLobby.test.tsx`, `src/app/globals.css`
- Test: `src/components/HpBar.test.tsx`, `src/components/PlayerOrder.test.tsx`

**Interfaces:**
- Consumes: `BASE_MAX_HP`, `weaponFor`.
- Produces: `RoundPlayer` gains `hp: number`, `maxHp: number`, `weaponId: string | null`, `status: 'active' | 'downed'`; `HpBar({ hp, maxHp })`.

- [ ] **Step 1: Write the failing tests**

`src/components/HpBar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HpBar } from './HpBar';

describe('HpBar', () => {
  it('shows current and max HP', () => {
    render(<HpBar hp={12} maxHp={20} />);
    expect(screen.getByLabelText('HP 12 จาก 20')).toBeInTheDocument();
    expect(screen.getByText('12/20')).toBeInTheDocument();
  });

  it('shows how much max HP has been lost', () => {
    render(<HpBar hp={5} maxHp={14} />);
    expect(screen.getByText(/max −6/)).toBeInTheDocument();
  });

  it('flags low health', () => {
    const { container } = render(<HpBar hp={4} maxHp={20} />);
    expect(container.querySelector('.hp-fill.low')).not.toBeNull();
  });
});
```

Update the fixtures (required fields):
- `src/components/PlayerOrder.test.tsx` lines 6-8 become:
```ts
const character = { hp: 20, maxHp: 20, weaponId: 'shortsword', status: 'active' as const };
const players = [
  { id: 'p1', displayName: 'Prem', acted: true, isOwner: true, ...character },
  { id: 'p2', displayName: 'Mila', acted: false, isOwner: false, ...character },
  { id: 'p3', displayName: 'Tan', acted: false, isOwner: false, ...character },
];
```
(replacing the existing `const players = [ … ];` block).
- `src/components/CampaignLobby.test.tsx` lines 7-8: add `hp: 20, maxHp: 20, weaponId: 'shortsword', status: 'active' as const,` to both entries.

Append to `PlayerOrder.test.tsx`:
```tsx
  it('shows each weapon, an HP bar, and a downed badge for a player who cannot act', () => {
    const party = [
      { ...players[0], hp: 12, maxHp: 18 },
      { ...players[1], hp: 0, status: 'downed' as const, weaponId: 'staff' },
      players[2],
    ];
    render(<PlayerOrder players={party} currentPlayerId="p1" locked={false} onMove={() => {}} />);

    expect(screen.getByLabelText('HP 12 จาก 18')).toBeInTheDocument();
    expect(screen.getByText('ล้มลง')).toBeInTheDocument();
    expect(screen.getByText(/ไม้เท้า/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/HpBar.test.tsx src/components/PlayerOrder.test.tsx`
Expected: FAIL — `HpBar` missing; PlayerOrder shows no HP/weapon/badge.

- [ ] **Step 3: Implement**

`src/components/HpBar.tsx`:
```tsx
import { BASE_MAX_HP } from '@/lib/character/constants';

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const lost = BASE_MAX_HP - maxHp;
  const pct = (n: number) => `${(n / BASE_MAX_HP) * 100}%`;
  const low = maxHp > 0 && hp / maxHp <= 0.3;
  return (
    <div className="hp" aria-label={`HP ${hp} จาก ${maxHp}`}>
      <div className="hp-track">
        <i className={`hp-fill${low ? ' low' : ''}`} style={{ width: pct(hp) }} />
        {lost > 0 && <i className="hp-lost" style={{ width: pct(lost) }} title={`max HP ลดลง ${lost}`} />}
      </div>
      <span className="hp-num">
        {hp}/{maxHp}
        {lost > 0 && <em> (max −{lost})</em>}
      </span>
    </div>
  );
}
```

`src/lib/supabase/players.ts`:
- `RoundPlayer` adds:
```ts
  hp: number;
  maxHp: number;
  weaponId: string | null;
  status: 'active' | 'downed';
```
- `.select('id, display_name, turn_order, created_at')` → `.select('id, display_name, turn_order, created_at, weapon_id, hp, max_hp, status')`.
- `rows` mapping adds `weaponId: (p.weapon_id ?? null) as string | null, hp: p.hp as number, maxHp: p.max_hp as number, status: p.status as 'active' | 'downed',` and the returned `.map((p) => ({ … }))` adds `hp: p.hp, maxHp: p.maxHp, weaponId: p.weaponId, status: p.status,`.

`src/lib/supabase/roundActionsRealtime.ts`: in `subscribeToRoundActionCount`, the players count query becomes
```ts
      supabaseBrowserClient
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'active'),
```

`src/components/PlayerOrder.tsx`: import `weaponFor` and `HpBar`; replace the `<span className="who">…</span>` block with
```tsx
            <span className="who">
              <span className="nm">
                {player.displayName}
                {player.id === currentPlayerId ? ' (คุณ)' : ''}
              </span>
              <span className="st" style={{ display: 'block' }}>
                {player.status === 'downed' ? (
                  <b className="badge-down">ล้มลง</b>
                ) : (
                  <span>{player.acted ? 'ส่งแล้ว' : 'กำลังคิด…'}</span>
                )}
                <span className="wpn"> · {weaponFor(player.weaponId).nameTh}</span>
              </span>
              <HpBar hp={player.hp} maxHp={player.maxHp} />
            </span>
```
and add `${player.status === 'downed' ? ' is-down' : ''}` to the `<li>` className template. The avatar: `{player.status === 'downed' ? '✕' : player.displayName.charAt(0)}` with `className={`av${player.status === 'downed' ? ' down' : ''}`}`.

`src/app/globals.css` (append):
```css
.hp { display: grid; gap: 3px; margin-top: 4px; }
.hp-track { display: flex; justify-content: space-between; height: 8px; border-radius: 9px; overflow: hidden; background: var(--surface-2); border: 1px solid var(--line); }
.hp-fill { display: block; height: 100%; background: var(--teal); transition: width 0.4s; }
.hp-fill.low { background: var(--danger); }
.hp-lost { display: block; height: 100%; margin-left: auto; background: repeating-linear-gradient(135deg, var(--line) 0 3px, transparent 3px 6px); }
.hp-num { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.hp-num em { font-style: normal; color: var(--danger); }
.av.down { border-color: var(--danger); color: var(--danger); }
.pl-row.is-down .nm { color: var(--muted); text-decoration: line-through; }
.badge-down { font-size: 11px; color: var(--danger); border: 1px solid var(--danger); border-radius: 999px; padding: 0 8px; font-weight: 600; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (the pre-existing PlayerOrder assertions such as "1 / 3 players have acted this round" are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/HpBar.tsx src/components/HpBar.test.tsx src/components/PlayerOrder.tsx src/components/PlayerOrder.test.tsx src/components/CampaignLobby.test.tsx src/lib/supabase src/app/globals.css
git commit -m "feat(character): show HP, weapon and downed state in the player list

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Downed players cannot act, and the log shows stat changes

**Files:**
- Modify: `src/components/ActionInput.tsx`, `src/components/MessageList.tsx`, `src/app/campaign/[id]/page.tsx`, `src/app/globals.css`
- Test: `src/components/ActionInput.test.tsx`, `src/components/MessageList.test.tsx`

**Interfaces:**
- Consumes: `RoundPlayer.status`.
- Produces: `ActionInput` prop `disabledReason?: string` (locks every control and shows the reason); `MessageList` renders `{"type":"stats","changes":string[]}` system messages as one line per change.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ActionInput.test.tsx` (reusing its imports; add `render`, `screen` if the file does not already import them):
```tsx
  it('locks everything and shows the reason when the player cannot act', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActionInput onSubmit={onSubmit} disabledReason="คุณล้มลง ทำ action ไม่ได้ รอเพื่อนช่วยพยุง" />);

    expect(screen.getByText('คุณล้มลง ทำ action ไม่ได้ รอเพื่อนช่วยพยุง')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'โจมตี' })).toBeDisabled();
    expect(screen.getByLabelText('free text action')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ส่ง' })).toBeDisabled();
  });
```

Append to `src/components/MessageList.test.tsx`:
```tsx
  it('renders a stats message as one line per change', async () => {
    const fetchInitialMessages = vi.fn().mockResolvedValue([
      {
        id: 'm1',
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes: ['Prem −5 HP', 'Prem ล้มลง'] }),
      },
    ]);
    const subscribeToNewMessages = vi.fn(() => () => {});

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    await waitFor(() => expect(screen.getByText('Prem −5 HP')).toBeInTheDocument());
    expect(screen.getByText('Prem ล้มลง')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/ActionInput.test.tsx src/components/MessageList.test.tsx`
Expected: FAIL — buttons not disabled / stats rendered as raw JSON text.

- [ ] **Step 3: Implement**

`src/components/ActionInput.tsx`:
- `ActionInputProps` gains `disabledReason?: string;` and the function signature becomes `ActionInput({ onSubmit, disabledReason })`.
- Change `const locked = submitted || submitting;` to `const locked = submitted || submitting || Boolean(disabledReason);`.
- Add as the first child of the returned `<div className="dock">`:
```tsx
      {disabledReason && <p className="down-note">{disabledReason}</p>}
```
- In `handleSubmit`, the early return already covers locked state via `submitted || submitting`; add `|| disabledReason` to that guard: `if (!actionText.trim() || submitted || submitting || disabledReason) return;`.

`src/components/MessageList.tsx`:
- Add next to `parseRollMessage`:
```ts
function parseStatsMessage(content: string): string[] | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'stats' && Array.isArray(parsed.changes)) {
      return parsed.changes.filter((line: unknown): line is string => typeof line === 'string');
    }
  } catch {
    return null;
  }
  return null;
}
```
- In the `messages.map`, after `const rolls = …`, add `const stats = message.role === 'system' ? parseStatsMessage(message.content) : null;` and replace the content expression with:
```tsx
              {rolls ? (
                <RollSummary rolls={rolls} pending={pending} />
              ) : stats ? (
                <ul className="stat-list">
                  {stats.map((line, i) => (
                    <li key={i} className="stat-line">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>{message.content}</span>
              )}
```

`src/app/campaign/[id]/page.tsx`: where `<ActionInput …/>` is rendered, add the prop
```tsx
              disabledReason={
                players.find((p) => p.id === playerId)?.status === 'downed'
                  ? 'คุณล้มลง ทำ action ไม่ได้ รอเพื่อนช่วยพยุง'
                  : undefined
              }
```

`src/app/globals.css` (append):
```css
.down-note { margin: 0; color: var(--danger); font-size: 13px; }
.stat-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; justify-items: center; }
.stat-line { font-family: var(--f-display); letter-spacing: 0.02em; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActionInput.tsx src/components/ActionInput.test.tsx src/components/MessageList.tsx src/components/MessageList.test.tsx "src/app/campaign/[id]/page.tsx" src/app/globals.css
git commit -m "feat(character): lock input for downed players and show stat changes in the log

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Apply the migration to the live database, verify, and clean up the prototype

**Files:**
- Delete: `src/app/prototype/character-status/page.tsx` (the throwaway prototype; keep its variant B code only in git history if the user wants it)
- Modify: none other

- [ ] **Step 1: Apply `0007_character_status.sql` through the user's logged-in Chrome**

Open `https://supabase.com/dashboard/project/ygkejthacdtpvwuhblve/sql/new` with the Claude in Chrome tools, paste the full contents of `supabase/migrations/0007_character_status.sql` into the editor, click Run, and confirm the result says "Success. No rows returned".

- [ ] **Step 2: Verify the schema landed**

Run (uses the service-role key already in `.env.local`; do not print it):
```bash
curl -s "https://ygkejthacdtpvwuhblve.supabase.co/rest/v1/players?select=id,hp,max_hp,weapon_id,status,revives_since_sanctuary&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s "https://ygkejthacdtpvwuhblve.supabase.co/rest/v1/campaigns?select=id,pending_wipe&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: JSON rows containing the new columns (no `42703 column does not exist` error).

- [ ] **Step 3: Play a round on the dev server and check each behavior**

With the user's running dev server (do not restart it), create a room, pick a weapon, start, and submit an action. Confirm in the browser: the player list shows the weapon and an HP bar; after a round in which the AI emits a `[[hurt: …]]` tag, a stat line such as "Prem −5 HP" appears in the log and the bar drops; the visible narration contains no `[[…]]` text. If the AI never emits a tag in a few rounds, note it in the report instead of forcing it.

- [ ] **Step 4: Remove the prototype and run everything**

```bash
git rm -r src/app/prototype
npx vitest run
npx tsc --noEmit
```
Expected: all tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove the character-status prototype now that it is implemented

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Deploy only when the user asks.)
