# Inventory and Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every character carries weapons, armor, potions and story items; gear changes the numbers; the AI DM hands items out and takes them away; the server owns every item.

**Architecture:** A pure module `src/lib/inventory/` (catalog, rules, tag/potion application, prompt) is wired into the existing `processRound` pipeline next to the character-status code. Inventory lives in a new `inventory_items` table that only the server writes (service-role routes and `processRound`); clients read it through RLS + realtime. Equip/unequip go through a Bearer-authenticated route like `turn-order`; drinking a potion is a round action carrying `use_item_id`.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres, RLS, Realtime), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-30-inventory-design.md`

## Global Constraints

- The server rolls every die; the AI never states numbers (same rule as `character-status`).
- Carry capacity is `CARRY_CAPACITY = 10`; story items cap at `MAX_STORY_UNITS = 5` units and titles at `MAX_STORY_TITLE = 40` characters.
- Armor reduction is per hit and a hit always deals at least 1.
- Bare hands (`fists`, 1d2) are not an inventory item: no equipped weapon means fists.
- `inventory_items` has **no** insert/update/delete RLS policy: every write uses the service-role client.
- Failures in inventory persistence during a round are best-effort and must never fail or stall a round.
- Route handlers export only HTTP methods; `params` is a Promise (Next 15).
- **Never run `npm run build` and never delete `.next`** while the user's `npm run dev` is running (it shares `.next`). Use `npx vitest run` and `npx tsc --noEmit`. Two `tsc` errors from stale `.next/types` (deleted prototype route) are expected and ignored.
- Thai UI copy; the game log lines are Thai.
- Commit steps are omitted: the user's standing rule is to commit only when asked. Ask at the end.

## Review Focus

1. A story item title the AI spells differently (case or spaces) on `take`: matched case-insensitively and trimmed; a genuinely different title is ignored, never removes the wrong item. (Task 1 `takeItem`, Task 4.)
2. A `give` when the pack is full: item refused, the log says so, nothing else changes. (Task 4.)
3. `take` of an equipped item removes it and leaves the slot empty; a player never holds an equipped item they no longer own. (Task 1.)
4. A potion action from a downed player, or naming a potion the player does not own, is ignored and the round still runs. (Task 4, Task 7.)
5. A `give`/`take` tag with a wrong keyword shape, e.g. `[[give: Prem]]`, is hidden from the narration and never applied. (Task 2.)

## File Structure

- Create `src/lib/inventory/{catalog,types,rules,apply,prompt,rows,startingKit,equipItem}.ts` (+ tests): pure inventory logic and server helpers.
- Create `src/lib/character/names.ts`: shared name matching.
- Create `src/app/api/campaigns/[id]/inventory/equip/route.ts` (+ test).
- Create `src/lib/supabase/inventory.ts`: client fetch/subscribe/equip helper.
- Create `src/components/Inventory.tsx` (+ test).
- Create `supabase/migrations/0008_inventory.sql`.
- Modify `src/lib/character/{types,tags,applyTags}.ts`, `src/lib/round/{assemblePrompt,roundRepository,processRound}.ts` (+ tests), `src/lib/campaign/{createCampaign,joinCampaign}.ts`, `src/lib/supabase/{players,submitAction}.ts`, `src/components/{PlayerOrder,ActionInput}.tsx` (+ tests), `src/app/campaign/[id]/page.tsx`, `src/app/globals.css`.

---

### Task 1: Catalog and inventory rules (pure)

**Files:**
- Create: `src/lib/inventory/catalog.ts`, `src/lib/inventory/types.ts`, `src/lib/inventory/rules.ts`
- Test: `src/lib/inventory/rules.test.ts`

**Interfaces:**
- Produces (`catalog.ts`): `CARRY_CAPACITY`, `MAX_STORY_UNITS`, `MAX_STORY_TITLE`, `STORY_ITEM_ID = 'story'`, `type Slot = 'weapon' | 'armor'`, `type CatalogEntry`, `CATALOG`, `catalogEntry(id: string): CatalogEntry | null`, `slotOf(entry: CatalogEntry): Slot | null`.
- Produces (`types.ts`): `interface InventoryItem { itemId: string; customName: string; quantity: number; slot: Slot | null; equipped: boolean }` (`customName` is `''` for catalog items) and `type Inventories = Record<string, InventoryItem[]>` (keyed by player id).
- Produces (`rules.ts`): `itemLabel(item)`, `weightOf(items)`, `giveItem(items, itemId, customName?) → { items, result: 'added' | 'full' | 'unknown', label }`, `takeItem(items, itemId, customName?) → { items, taken, label }`, `equipItem(items, itemId) → { items, ok }`, `unequipSlot(items, slot) → InventoryItem[]`, `equippedWeaponId(items): string | null`, `equippedArmorId(items): string | null`, `armorReduction(items): number`, `useConsumable(items, itemId) → { items, heal: DiceSpec, label } | null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/inventory/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  armorReduction, equipItem, equippedArmorId, equippedWeaponId, giveItem, itemLabel,
  takeItem, unequipSlot, useConsumable, weightOf,
} from './rules';
import type { InventoryItem } from './types';

const item = (over: Partial<InventoryItem> & { itemId: string }): InventoryItem => ({
  customName: '', quantity: 1, slot: null, equipped: false, ...over,
});
const sword = item({ itemId: 'shortsword', slot: 'weapon', equipped: true });

describe('weightOf', () => {
  it('sums catalog weight times quantity and counts story items as 0', () => {
    const items = [sword, item({ itemId: 'potion_minor', quantity: 3 }), item({ itemId: 'story', customName: 'Rusty Key' })];
    expect(weightOf(items)).toBe(2 + 3);
  });
});

describe('giveItem', () => {
  it('adds a new item and stacks a repeat', () => {
    const once = giveItem([], 'potion_minor');
    expect(once).toMatchObject({ result: 'added', label: 'ยาฟื้นฟูเล็ก' });
    const twice = giveItem(once.items, 'potion_minor');
    expect(twice.items).toEqual([item({ itemId: 'potion_minor', quantity: 2 })]);
  });

  it('auto-equips a weapon or armor into an empty slot but not into a taken one', () => {
    const first = giveItem([], 'armor_light').items;
    expect(first[0]).toMatchObject({ slot: 'armor', equipped: true });
    const second = giveItem(first, 'armor_heavy').items;
    expect(second.find((i) => i.itemId === 'armor_heavy')).toMatchObject({ equipped: false });
  });

  it('refuses an item that would push weight past 10 and leaves the pack untouched', () => {
    const packed = [item({ itemId: 'potion_minor', quantity: 8 }), sword]; // weight 10
    const result = giveItem(packed, 'potion_minor');
    expect(result).toMatchObject({ result: 'full', label: 'ยาฟื้นฟูเล็ก' });
    expect(result.items).toBe(packed);
  });

  it('ignores unknown catalog ids', () => {
    expect(giveItem([], 'lightsaber').result).toBe('unknown');
  });

  it('adds story items by title, trims and shortens the title, merges case-insensitively, caps at 5 units', () => {
    const a = giveItem([], 'story', '  Rusty Key  ');
    expect(a.items[0]).toMatchObject({ itemId: 'story', customName: 'Rusty Key', slot: null });
    const b = giveItem(a.items, 'story', 'rusty key');
    expect(b.items).toHaveLength(1);
    expect(b.items[0].quantity).toBe(2);
    expect(giveItem([], 'story', 'x'.repeat(60)).items[0].customName).toHaveLength(40);
    expect(giveItem([], 'story', '   ').result).toBe('unknown');
    const five = item({ itemId: 'story', customName: 'Coin', quantity: 5 });
    expect(giveItem([five], 'story', 'Map').result).toBe('full');
  });
});

describe('takeItem', () => {
  it('removes one unit and deletes the row at zero, dropping the equipped flag with it', () => {
    const two = [item({ itemId: 'potion_minor', quantity: 2 })];
    expect(takeItem(two, 'potion_minor').items[0].quantity).toBe(1);
    const gone = takeItem([sword], 'shortsword');
    expect(gone).toMatchObject({ taken: true, label: 'ดาบสั้น', items: [] });
    expect(equippedWeaponId(gone.items)).toBeNull();
  });

  it('matches story titles ignoring case and stray spaces, and ignores a different title', () => {
    const items = [item({ itemId: 'story', customName: 'Rusty Key' })];
    expect(takeItem(items, 'story', ' rusty KEY ').taken).toBe(true);
    const other = takeItem(items, 'story', 'Golden Key');
    expect(other.taken).toBe(false);
    expect(other.items).toBe(items);
  });

  it('ignores an item the player does not have', () => {
    expect(takeItem([sword], 'potion_minor').taken).toBe(false);
  });
});

describe('equipping', () => {
  const bow = item({ itemId: 'shortbow', slot: 'weapon' });

  it('equips into a slot and unequips whatever was there', () => {
    const result = equipItem([sword, bow], 'shortbow');
    expect(result.ok).toBe(true);
    expect(equippedWeaponId(result.items)).toBe('shortbow');
    expect(result.items.filter((i) => i.equipped)).toHaveLength(1);
  });

  it('refuses items without a slot or that are not owned', () => {
    expect(equipItem([item({ itemId: 'potion_minor' })], 'potion_minor').ok).toBe(false);
    expect(equipItem([sword], 'shortbow').ok).toBe(false);
  });

  it('unequips a slot', () => {
    expect(equippedWeaponId(unequipSlot([sword], 'weapon'))).toBeNull();
  });
});

describe('armor and consumables', () => {
  it('reads armor reduction from the equipped armor only', () => {
    const worn = item({ itemId: 'armor_medium', slot: 'armor', equipped: true });
    const spare = item({ itemId: 'armor_heavy', slot: 'armor' });
    expect(armorReduction([worn, spare])).toBe(2);
    expect(equippedArmorId([worn, spare])).toBe('armor_medium');
    expect(armorReduction([spare])).toBe(0);
  });

  it('consumes one potion and returns its heal dice; refuses non-consumables and missing potions', () => {
    const used = useConsumable([item({ itemId: 'potion_major', quantity: 2 })], 'potion_major');
    expect(used).toMatchObject({ heal: { count: 2, sides: 6, bonus: 0 }, label: 'ยาฟื้นฟูใหญ่' });
    expect(used!.items[0].quantity).toBe(1);
    expect(useConsumable([sword], 'shortsword')).toBeNull();
    expect(useConsumable([], 'potion_minor')).toBeNull();
  });
});

describe('itemLabel', () => {
  it('uses the Thai catalog name or the story title', () => {
    expect(itemLabel(item({ itemId: 'staff' }))).toBe('ไม้เท้า');
    expect(itemLabel(item({ itemId: 'story', customName: 'Rusty Key' }))).toBe('Rusty Key');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/inventory/rules.test.ts`
Expected: FAIL — cannot resolve `./rules`.

- [ ] **Step 3: Implement**

`src/lib/inventory/catalog.ts`:

```ts
import { WEAPONS, type DiceSpec } from '@/lib/character/constants';

export const CARRY_CAPACITY = 10;
export const MAX_STORY_UNITS = 5;
export const MAX_STORY_TITLE = 40;
export const STORY_ITEM_ID = 'story';

export type Slot = 'weapon' | 'armor';

export type CatalogEntry =
  | { kind: 'weapon'; nameTh: string; weight: number }
  | { kind: 'armor'; nameTh: string; weight: number; reduction: number }
  | { kind: 'consumable'; nameTh: string; weight: number; heal: DiceSpec };

// Weapon dice live in character/constants WEAPONS (single source of truth); ids match its keys.
export const CATALOG = {
  shortsword: { kind: 'weapon', nameTh: WEAPONS.shortsword.nameTh, weight: 2 },
  shortbow: { kind: 'weapon', nameTh: WEAPONS.shortbow.nameTh, weight: 2 },
  staff: { kind: 'weapon', nameTh: WEAPONS.staff.nameTh, weight: 2 },
  armor_light: { kind: 'armor', nameTh: 'เกราะหนัง', weight: 1, reduction: 1 },
  armor_medium: { kind: 'armor', nameTh: 'เกราะโซ่', weight: 2, reduction: 2 },
  armor_heavy: { kind: 'armor', nameTh: 'เกราะเหล็ก', weight: 3, reduction: 3 },
  potion_minor: { kind: 'consumable', nameTh: 'ยาฟื้นฟูเล็ก', weight: 1, heal: { count: 1, sides: 6, bonus: 1 } },
  potion_major: { kind: 'consumable', nameTh: 'ยาฟื้นฟูใหญ่', weight: 1, heal: { count: 2, sides: 6, bonus: 0 } },
} as const satisfies Record<string, CatalogEntry>;
export type CatalogId = keyof typeof CATALOG;

export function catalogEntry(id: string): CatalogEntry | null {
  return Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id as CatalogId] : null;
}

export function slotOf(entry: CatalogEntry): Slot | null {
  return entry.kind === 'consumable' ? null : entry.kind;
}
```

`src/lib/inventory/types.ts`:

```ts
import type { Slot } from './catalog';

export interface InventoryItem {
  itemId: string;
  /** Story items only; '' for catalog items. */
  customName: string;
  quantity: number;
  slot: Slot | null;
  equipped: boolean;
}

/** One player's items, keyed by player id. */
export type Inventories = Record<string, InventoryItem[]>;
```

`src/lib/inventory/rules.ts`:

```ts
import type { DiceSpec } from '@/lib/character/constants';
import {
  CARRY_CAPACITY, MAX_STORY_TITLE, MAX_STORY_UNITS, STORY_ITEM_ID, catalogEntry, slotOf, type Slot,
} from './catalog';
import type { InventoryItem } from './types';

const isStory = (item: { itemId: string }) => item.itemId === STORY_ITEM_ID;
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function itemLabel(item: { itemId: string; customName: string }): string {
  if (isStory(item)) return item.customName;
  return catalogEntry(item.itemId)?.nameTh ?? item.itemId;
}

export function weightOf(items: InventoryItem[]): number {
  return items.reduce((sum, i) => sum + (catalogEntry(i.itemId)?.weight ?? 0) * i.quantity, 0);
}

export type GiveResult = 'added' | 'full' | 'unknown';

export function giveItem(
  items: InventoryItem[],
  itemId: string,
  customName = ''
): { items: InventoryItem[]; result: GiveResult; label: string } {
  if (itemId === STORY_ITEM_ID) {
    const title = customName.trim().slice(0, MAX_STORY_TITLE);
    if (!title) return { items, result: 'unknown', label: '' };
    const units = items.filter(isStory).reduce((sum, i) => sum + i.quantity, 0);
    if (units >= MAX_STORY_UNITS) return { items, result: 'full', label: title };
    const existing = items.find((i) => isStory(i) && sameTitle(i.customName, title));
    if (existing) {
      return {
        items: items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i)),
        result: 'added',
        label: existing.customName,
      };
    }
    return {
      items: [...items, { itemId: STORY_ITEM_ID, customName: title, quantity: 1, slot: null, equipped: false }],
      result: 'added',
      label: title,
    };
  }

  const entry = catalogEntry(itemId);
  if (!entry) return { items, result: 'unknown', label: '' };
  if (weightOf(items) + entry.weight > CARRY_CAPACITY) return { items, result: 'full', label: entry.nameTh };

  const existing = items.find((i) => i.itemId === itemId);
  if (existing) {
    return {
      items: items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i)),
      result: 'added',
      label: entry.nameTh,
    };
  }
  const slot = slotOf(entry);
  // A player who finds their first sword or armor is not left with it in the backpack.
  const slotFree = slot !== null && !items.some((i) => i.equipped && i.slot === slot);
  return {
    items: [...items, { itemId, customName: '', quantity: 1, slot, equipped: slotFree }],
    result: 'added',
    label: entry.nameTh,
  };
}

export function takeItem(
  items: InventoryItem[],
  itemId: string,
  customName = ''
): { items: InventoryItem[]; taken: boolean; label: string } {
  const row = items.find(
    (i) => i.itemId === itemId && (itemId !== STORY_ITEM_ID || sameTitle(i.customName, customName))
  );
  if (!row) return { items, taken: false, label: '' };
  const next =
    row.quantity > 1 ? items.map((i) => (i === row ? { ...i, quantity: i.quantity - 1 } : i)) : items.filter((i) => i !== row);
  return { items: next, taken: true, label: itemLabel(row) };
}

export function equipItem(items: InventoryItem[], itemId: string): { items: InventoryItem[]; ok: boolean } {
  const row = items.find((i) => i.itemId === itemId);
  if (!row || row.slot === null) return { items, ok: false };
  if (row.equipped) return { items, ok: true };
  return {
    items: items.map((i) => (i === row ? { ...i, equipped: true } : i.slot === row.slot ? { ...i, equipped: false } : i)),
    ok: true,
  };
}

export function unequipSlot(items: InventoryItem[], slot: Slot): InventoryItem[] {
  return items.map((i) => (i.slot === slot && i.equipped ? { ...i, equipped: false } : i));
}

export const equippedWeaponId = (items: InventoryItem[]): string | null =>
  items.find((i) => i.equipped && i.slot === 'weapon')?.itemId ?? null;

export const equippedArmorId = (items: InventoryItem[]): string | null =>
  items.find((i) => i.equipped && i.slot === 'armor')?.itemId ?? null;

export function armorReduction(items: InventoryItem[]): number {
  const id = equippedArmorId(items);
  const entry = id ? catalogEntry(id) : null;
  return entry?.kind === 'armor' ? entry.reduction : 0;
}

export function useConsumable(
  items: InventoryItem[],
  itemId: string
): { items: InventoryItem[]; heal: DiceSpec; label: string } | null {
  const entry = catalogEntry(itemId);
  if (!entry || entry.kind !== 'consumable') return null;
  const taken = takeItem(items, itemId);
  return taken.taken ? { items: taken.items, heal: entry.heal, label: entry.nameTh } : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/inventory/rules.test.ts`
Expected: PASS (all tests in the file).

---

### Task 2: Shared name matching and `give`/`take` tags

**Files:**
- Create: `src/lib/character/names.ts`, `src/lib/character/names.test.ts`
- Modify: `src/lib/character/tags.ts`, `src/lib/character/tags.test.ts`, `src/lib/character/applyTags.ts`

**Interfaces:**
- Produces: `findByDisplayName<T extends { displayName: string }>(list: T[], name: string): T | null`; `CharacterTag` gains `{ kind: 'give' | 'take'; name: string; itemId: string; customName: string }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/character/names.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findByDisplayName } from './names';

describe('findByDisplayName', () => {
  const list = [{ displayName: 'Prem ', id: 1 }, { displayName: 'Suki', id: 2 }];
  it('matches ignoring case and stray spaces on either side', () => {
    expect(findByDisplayName(list, ' prem')?.id).toBe(1);
  });
  it('returns null for unknown names', () => {
    expect(findByDisplayName(list, 'Nobody')).toBeNull();
  });
  it('returns null when two players share the name', () => {
    expect(findByDisplayName([...list, { displayName: 'suki', id: 3 }], 'Suki')).toBeNull();
  });
});
```

Append to `src/lib/character/tags.test.ts` (inside its top-level `describe`, or as a new `describe` using the file's existing `parseCharacterTags` import):

```ts
describe('give and take tags', () => {
  it('parses catalog items and story titles, keeping the title case and spaces', () => {
    const { tags, cleanText } = parseCharacterTags(
      'ได้ของ\n[[give: Prem | potion_minor]]\n[[give: Prem | story: Rusty Key]]\n[[take: Suki | Armor_Light]]'
    );
    expect(tags).toEqual([
      { kind: 'give', name: 'Prem', itemId: 'potion_minor', customName: '' },
      { kind: 'give', name: 'Prem', itemId: 'story', customName: 'Rusty Key' },
      { kind: 'take', name: 'Suki', itemId: 'armor_light', customName: '' },
    ]);
    expect(cleanText).toBe('ได้ของ');
  });

  it('hides malformed give/take tags and applies nothing', () => {
    const { tags, cleanText } = parseCharacterTags('ok [[give: Prem]] [[take]] end');
    expect(tags).toEqual([]);
    expect(cleanText).not.toContain('[[');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/character/names.test.ts src/lib/character/tags.test.ts`
Expected: FAIL — `./names` missing; give/take tests fail (no tags parsed).

- [ ] **Step 3: Implement**

`src/lib/character/names.ts`:

```ts
/** Unknown or ambiguous names resolve to null so a bad tag can never hit the wrong player. */
export function findByDisplayName<T extends { displayName: string }>(list: T[], name: string): T | null {
  const wanted = name.trim().toLowerCase();
  const matches = list.filter((c) => c.displayName.trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}
```

`src/lib/character/tags.ts` — replace the type, both regexes and the loop:

```ts
export type CharacterTag =
  | { kind: 'hurt' | 'heal'; name: string; tier: Tier }
  | { kind: 'revive'; name: string }
  | { kind: 'sanctuary' }
  | { kind: 'give' | 'take'; name: string; itemId: string; customName: string };

// One pattern for every valid tag so matches come back in reading order.
// Groups: 1 hurt|heal, 2 name, 3 tier, 4 revive name, 5 sanctuary,
//         6 give|take, 7 name, 8 story title, 9 catalog item id.
const VALID_TAG =
  /\[\[\s*(?:(hurt|heal)\s*:\s*([^|\]]+?)\s*\|\s*(light|medium|heavy)|revive\s*:\s*([^\]]+?)|(sanctuary)|(give|take)\s*:\s*([^|\]]+?)\s*\|\s*(?:story\s*:\s*([^\]]+?)|([a-z_]+)))\s*\]\]/gi;
// A tag-shaped leftover (bad tier, missing part): hidden from players, never applied.
const LEFTOVER_TAG = /\[\[\s*(?:hurt|heal|revive|sanctuary|give|take)\b[^\]]*\]\]/gi;

export function parseCharacterTags(text: string): { tags: CharacterTag[]; cleanText: string } {
  const tags: CharacterTag[] = [];
  for (const match of text.matchAll(VALID_TAG)) {
    if (match[1]) {
      tags.push({
        kind: match[1].toLowerCase() as 'hurt' | 'heal',
        name: match[2].trim(),
        tier: match[3].toLowerCase() as Tier,
      });
    } else if (match[4]) {
      tags.push({ kind: 'revive', name: match[4].trim() });
    } else if (match[6]) {
      const story = match[8] !== undefined;
      tags.push({
        kind: match[6].toLowerCase() as 'give' | 'take',
        name: match[7].trim(),
        itemId: story ? 'story' : match[9].toLowerCase(),
        customName: story ? match[8].trim() : '',
      });
    } else {
      tags.push({ kind: 'sanctuary' });
    }
  }
  const cleanText = text.replace(VALID_TAG, '').replace(LEFTOVER_TAG, '').trimEnd();
  return { tags, cleanText };
}
```

`src/lib/character/applyTags.ts` — import the helper and use it (delete the local `find` closure body):

```ts
import { findByDisplayName } from './names';
// ...
  const find = (name: string): Character | null => findByDisplayName(next, name);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/character`
Expected: PASS — the new tests and all 25 existing character tests (the TS narrowing in `applyTags` still compiles: `give`/`take` fall through the `hurt/heal/revive` branches).

---

### Task 3: Armor absorbs damage

**Files:**
- Modify: `src/lib/character/types.ts`, `src/lib/character/applyTags.ts`
- Test: `src/lib/character/applyTags.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `Character.armorReduction?: number` (absent means 0). `hurt` damage becomes `max(1, roll − armorReduction)`; the log line gains ` (เกราะกัน N)` when armor actually absorbed N > 0.

- [ ] **Step 1: Write the failing tests**

Add inside the `describe` in `applyTags.test.ts`:

```ts
  it('lets armor absorb damage and says how much', () => {
    const result = applyCharacterTags([char({ armorReduction: 2 })], [{ kind: 'hurt', name: 'Prem', tier: 'medium' }], four);
    expect(byName(result, 'Prem').hp).toBe(17); // medium = 5, armor 2 -> 3
    expect(result.changes).toEqual(['Prem −3 HP (เกราะกัน 2)']);
  });

  it('never lets armor cut a hit below 1', () => {
    const one = () => 1;
    const result = applyCharacterTags([char({ armorReduction: 3 })], [{ kind: 'hurt', name: 'Prem', tier: 'light' }], one);
    expect(byName(result, 'Prem').hp).toBe(19);
    expect(result.changes).toEqual(['Prem −1 HP']);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/character/applyTags.test.ts`
Expected: FAIL — `armorReduction` not on `Character` (type error) / damage not reduced.

- [ ] **Step 3: Implement**

`types.ts` — add to `Character`:

```ts
  /** Flat damage the equipped armor absorbs from each hit; absent means none. */
  armorReduction?: number;
```

`applyTags.ts` — replace the hurt branch body:

```ts
    if (tag.kind === 'hurt' && target.status === 'active') {
      const rolled = rollDice(TIERS[tag.tier], rollDie);
      const damage = Math.max(1, rolled - (target.armorReduction ?? 0));
      const absorbed = rolled - damage;
      target.hp = Math.max(0, target.hp - damage);
      changes.push(`${target.displayName} −${damage} HP${absorbed > 0 ? ` (เกราะกัน ${absorbed})` : ''}`);
      if (target.hp === 0) {
        target.status = 'downed';
        changes.push(`${target.displayName} ล้มลง`);
      }
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/character` then `npx tsc --noEmit`
Expected: PASS; `tsc` shows only the 2 known stale `.next/types` errors.

---

### Task 4: Applying give/take tags and potion actions (pure)

**Files:**
- Create: `src/lib/inventory/apply.ts`
- Test: `src/lib/inventory/apply.test.ts`

**Interfaces:**
- Consumes: `findByDisplayName`, `giveItem`, `takeItem`, `useConsumable`, `rollDice`, `CharacterTag`, `Character`, `Inventories`.
- Produces:
  - `applyInventoryTags(characters: Pick<Character, 'id' | 'displayName'>[], inventories: Inventories, tags: CharacterTag[]) → { inventories: Inventories; changes: string[]; changedPlayerIds: string[] }`
  - `applyPotionActions(characters: Character[], inventories: Inventories, uses: { playerId?: string; useItemId?: string | null }[], rollDie: (sides: number) => number) → { characters: Character[]; inventories: Inventories; changes: string[]; notes: Record<string, string>; changedPlayerIds: string[] }` (`notes` keyed by player id, English text for the prompt).

- [ ] **Step 1: Write the failing tests**

`src/lib/inventory/apply.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyInventoryTags, applyPotionActions } from './apply';
import type { Character } from '@/lib/character/types';
import type { InventoryItem, Inventories } from './types';

const four = () => 4;
const person = (id: string, displayName: string, over: Partial<Character> = {}): Character => ({
  id, displayName, weaponId: null, hp: 10, maxHp: 20, status: 'active', revivesSinceSanctuary: 0, ...over,
});
const potion = (quantity = 1): InventoryItem => ({ itemId: 'potion_minor', customName: '', quantity, slot: null, equipped: false });
const party = [person('p1', 'Prem'), person('p2', 'Suki')];

describe('applyInventoryTags', () => {
  it('gives a catalog item and a story item and reports them in the log', () => {
    const result = applyInventoryTags(
      party, {},
      [
        { kind: 'give', name: 'prem', itemId: 'potion_minor', customName: '' },
        { kind: 'give', name: 'Suki', itemId: 'story', customName: 'Rusty Key' },
      ]
    );
    expect(result.inventories.p1[0]).toMatchObject({ itemId: 'potion_minor', quantity: 1 });
    expect(result.inventories.p2[0]).toMatchObject({ itemId: 'story', customName: 'Rusty Key' });
    expect(result.changes).toEqual(['Prem ได้รับ ยาฟื้นฟูเล็ก', 'Suki ได้รับ Rusty Key']);
    expect(result.changedPlayerIds.sort()).toEqual(['p1', 'p2']);
  });

  it('says so when the pack is full and changes nothing', () => {
    const full: Inventories = { p1: [potion(10)] };
    const result = applyInventoryTags(party, full, [{ kind: 'give', name: 'Prem', itemId: 'potion_minor', customName: '' }]);
    expect(result.inventories.p1).toBe(full.p1);
    expect(result.changes).toEqual(['Prem แบกไม่ไหว: ไม่ได้รับ ยาฟื้นฟูเล็ก']);
    expect(result.changedPlayerIds).toEqual([]);
  });

  it('takes items away, and ignores unknown names, unknown items and missing items', () => {
    const inv: Inventories = { p1: [potion(2)] };
    const result = applyInventoryTags(party, inv, [
      { kind: 'take', name: 'Prem', itemId: 'potion_minor', customName: '' },
      { kind: 'take', name: 'Nobody', itemId: 'potion_minor', customName: '' },
      { kind: 'give', name: 'Prem', itemId: 'lightsaber', customName: '' },
      { kind: 'take', name: 'Suki', itemId: 'potion_minor', customName: '' },
    ]);
    expect(result.inventories.p1[0].quantity).toBe(1);
    expect(result.changes).toEqual(['Prem เสียไป ยาฟื้นฟูเล็ก']);
  });

  it('does not mutate the input inventories', () => {
    const inv: Inventories = { p1: [potion()] };
    applyInventoryTags(party, inv, [{ kind: 'take', name: 'Prem', itemId: 'potion_minor', customName: '' }]);
    expect(inv.p1[0].quantity).toBe(1);
  });
});

describe('applyPotionActions', () => {
  it('heals, consumes the potion, and produces a log line and a prompt note', () => {
    const result = applyPotionActions(party, { p1: [potion()] }, [{ playerId: 'p1', useItemId: 'potion_minor' }], four);
    expect(result.characters.find((c) => c.id === 'p1')!.hp).toBe(15); // 1d6+1 with a 4 = 5
    expect(result.inventories.p1).toEqual([]);
    expect(result.changes).toEqual(['Prem ดื่ม ยาฟื้นฟูเล็ก (+5 HP)']);
    expect(result.notes.p1).toBe('drank ยาฟื้นฟูเล็ก and recovered 5 HP');
    expect(result.changedPlayerIds).toEqual(['p1']);
  });

  it('never heals past max HP', () => {
    const result = applyPotionActions([person('p1', 'Prem', { hp: 18 })], { p1: [potion()] }, [{ playerId: 'p1', useItemId: 'potion_minor' }], four);
    expect(result.characters[0].hp).toBe(20);
    expect(result.changes).toEqual(['Prem ดื่ม ยาฟื้นฟูเล็ก (+2 HP)']);
  });

  it('ignores a downed player, a potion they do not own, and an item that is not a consumable', () => {
    const downed = [person('p1', 'Prem', { hp: 0, status: 'downed' }), person('p2', 'Suki')];
    const result = applyPotionActions(
      downed,
      { p1: [potion()], p2: [] },
      [
        { playerId: 'p1', useItemId: 'potion_minor' },
        { playerId: 'p2', useItemId: 'potion_minor' },
        { playerId: 'p2', useItemId: 'shortsword' },
        { playerId: 'p2' },
        { useItemId: 'potion_minor' },
      ],
      four
    );
    expect(result.changes).toEqual([]);
    expect(result.changedPlayerIds).toEqual([]);
    expect(result.inventories.p1).toHaveLength(1);
  });

  it('does not mutate the input characters', () => {
    const input = [person('p1', 'Prem')];
    applyPotionActions(input, { p1: [potion()] }, [{ playerId: 'p1', useItemId: 'potion_minor' }], four);
    expect(input[0].hp).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/inventory/apply.test.ts`
Expected: FAIL — cannot resolve `./apply`.

- [ ] **Step 3: Implement**

`src/lib/inventory/apply.ts`:

```ts
import { rollDice } from '@/lib/character/dice';
import { findByDisplayName } from '@/lib/character/names';
import type { CharacterTag } from '@/lib/character/tags';
import type { Character } from '@/lib/character/types';
import { giveItem, takeItem, useConsumable } from './rules';
import type { Inventories } from './types';

export function applyInventoryTags(
  characters: Pick<Character, 'id' | 'displayName'>[],
  inventories: Inventories,
  tags: CharacterTag[]
): { inventories: Inventories; changes: string[]; changedPlayerIds: string[] } {
  const next: Inventories = { ...inventories };
  const changes: string[] = [];
  const changed = new Set<string>();

  for (const tag of tags) {
    if (tag.kind !== 'give' && tag.kind !== 'take') continue;
    const target = findByDisplayName(characters, tag.name);
    if (!target) continue;
    const items = next[target.id] ?? [];

    if (tag.kind === 'give') {
      const result = giveItem(items, tag.itemId, tag.customName);
      if (result.result === 'unknown') continue;
      if (result.result === 'full') {
        changes.push(`${target.displayName} แบกไม่ไหว: ไม่ได้รับ ${result.label}`);
        continue;
      }
      next[target.id] = result.items;
      changed.add(target.id);
      changes.push(`${target.displayName} ได้รับ ${result.label}`);
    } else {
      const result = takeItem(items, tag.itemId, tag.customName);
      if (!result.taken) continue;
      next[target.id] = result.items;
      changed.add(target.id);
      changes.push(`${target.displayName} เสียไป ${result.label}`);
    }
  }
  return { inventories: next, changes, changedPlayerIds: [...changed] };
}

export interface PotionUse {
  playerId?: string;
  useItemId?: string | null;
}

/** Applies this round's "drink a potion" actions before narration so the DM sees the real HP. */
export function applyPotionActions(
  characters: Character[],
  inventories: Inventories,
  uses: PotionUse[],
  rollDie: (sides: number) => number
): {
  characters: Character[];
  inventories: Inventories;
  changes: string[];
  notes: Record<string, string>;
  changedPlayerIds: string[];
} {
  const nextCharacters = characters.map((c) => ({ ...c }));
  const nextInventories: Inventories = { ...inventories };
  const changes: string[] = [];
  const notes: Record<string, string> = {};
  const changed = new Set<string>();

  for (const use of uses) {
    if (!use.playerId || !use.useItemId) continue;
    const character = nextCharacters.find((c) => c.id === use.playerId);
    if (!character || character.status !== 'active') continue;
    const used = useConsumable(nextInventories[character.id] ?? [], use.useItemId);
    if (!used) continue;
    const gained = Math.min(character.maxHp - character.hp, rollDice(used.heal, rollDie));
    character.hp += gained;
    nextInventories[character.id] = used.items;
    changed.add(character.id);
    changes.push(`${character.displayName} ดื่ม ${used.label} (+${gained} HP)`);
    notes[character.id] = `drank ${used.label} and recovered ${gained} HP`;
  }
  return { characters: nextCharacters, inventories: nextInventories, changes, notes, changedPlayerIds: [...changed] };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/inventory`
Expected: PASS.

---

### Task 5: Inventory in the DM prompt

**Files:**
- Create: `src/lib/inventory/prompt.ts`
- Modify: `src/lib/round/assemblePrompt.ts`
- Test: `src/lib/inventory/prompt.test.ts`, `src/lib/round/assemblePrompt.test.ts`

**Interfaces:**
- Consumes: `Character`, `Inventories`, `itemLabel`, `weightOf`, `CATALOG`, `CARRY_CAPACITY`.
- Produces: `inventoryPrompt(characters: Character[], inventories: Inventories): string[]` (empty array when no characters). `RoundAction` gains `playerId?: string`, `useItemId?: string | null`, `note?: string`. `assemblePrompt`'s `characterState` gains optional `inventories?: Inventories`.

- [ ] **Step 1: Write the failing tests**

`src/lib/inventory/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { inventoryPrompt } from './prompt';
import type { Character } from '@/lib/character/types';

const prem: Character = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active', revivesSinceSanctuary: 0 };

describe('inventoryPrompt', () => {
  it('is empty when there are no characters', () => {
    expect(inventoryPrompt([], {})).toEqual([]);
  });

  it("lists each player's items with equipped markers and weight, plus the catalog and tag rules", () => {
    const text = inventoryPrompt([prem], {
      p1: [
        { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true },
        { itemId: 'potion_minor', customName: '', quantity: 2, slot: null, equipped: false },
        { itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false },
      ],
    }).join('\n');
    expect(text).toContain('Prem: ดาบสั้น (equipped), ยาฟื้นฟูเล็ก x2, Rusty Key; weight 4/10');
    expect(text).toContain('potion_major');
    expect(text).toContain('[[give: PlayerName | item_id]]');
    expect(text).toContain('[[give: PlayerName | story: Title]]');
    expect(text).toContain('[[take: PlayerName | item_id]]');
  });

  it('shows an empty pack as nothing', () => {
    expect(inventoryPrompt([prem], {}).join('\n')).toContain('Prem: nothing; weight 0/10');
  });
});
```

Add to `assemblePrompt.test.ts`:

```ts
describe('assemblePrompt inventory', () => {
  const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 20, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };

  it('includes the inventory block and the server note on a potion action', () => {
    const prompt = assemblePrompt(
      '', [],
      [{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', note: 'drank ยาฟื้นฟูเล็ก and recovered 5 HP' }],
      null, null, undefined,
      { characters: [prem], pendingWipe: false, inventories: { p1: [] } }
    );
    expect(prompt).toContain('Prem: nothing; weight 0/10');
    expect(prompt).toContain('Prem: ดื่มยา (server: drank ยาฟื้นฟูเล็ก and recovered 5 HP)');
  });

  it('adds no inventory block when there is no character state', () => {
    const prompt = assemblePrompt('', [], [{ playerDisplayName: 'Prem', actionText: 'Look' }]);
    expect(prompt).not.toContain('weight');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/inventory/prompt.test.ts src/lib/round/assemblePrompt.test.ts`
Expected: FAIL — `./prompt` missing; the new assemblePrompt tests fail.

- [ ] **Step 3: Implement**

`src/lib/inventory/prompt.ts`:

```ts
import type { Character } from '@/lib/character/types';
import { CARRY_CAPACITY, CATALOG } from './catalog';
import { itemLabel, weightOf } from './rules';
import type { Inventories } from './types';

export function inventoryPrompt(characters: Character[], inventories: Inventories): string[] {
  if (characters.length === 0) return [];
  const catalog = Object.entries(CATALOG)
    .map(([id, entry]) => `${id} (${entry.nameTh}, weight ${entry.weight})`)
    .join(', ');

  return [
    `Inventories (managed by the game server; each player carries at most ${CARRY_CAPACITY} weight):`,
    ...characters.map((c) => {
      const items = inventories[c.id] ?? [];
      const list = items.length
        ? items
            .map((i) => `${itemLabel(i)}${i.quantity > 1 ? ` x${i.quantity}` : ''}${i.equipped ? ' (equipped)' : ''}`)
            .join(', ')
        : 'nothing';
      return `- ${c.displayName}: ${list}; weight ${weightOf(items)}/${CARRY_CAPACITY}`;
    }),
    '',
    'Hand items out or take them away with tags, each on its own line after your narration. The server checks them:',
    '  [[give: PlayerName | item_id]] - the player gains a catalog item',
    '  [[give: PlayerName | story: Title]] - the player gains a story object with no stats (a key, a letter)',
    '  [[take: PlayerName | item_id]] - the player loses one (same forms as give)',
    `Catalog: ${catalog}.`,
    'Give items sparingly, and prefer story objects unless a weapon, armor or potion is a real reward. A player whose pack is full cannot receive more; narrate that instead of inventing a way.',
  ];
}
```

`assemblePrompt.ts`:
- import `inventoryPrompt` from `@/lib/inventory/prompt` and `type Inventories` from `@/lib/inventory/types`.
- `RoundAction` add:

```ts
  /** Filled in by the server for potion actions; not sent to the model as a roll. */
  playerId?: string;
  useItemId?: string | null;
  /** Server-side outcome of the action (for example a potion drunk) that the narration must match. */
  note?: string;
```
- signature: `characterState?: { characters: Character[]; pendingWipe: boolean; inventories?: Inventories }`.
- in `actionsText` replace the return with:

```ts
      const note = a.note ? ` (server: ${a.note})` : '';
      return `${inOrder ? `${i + 1}. ` : ''}${a.playerDisplayName}${rolled}: ${a.actionText}${note}`;
```
- in the `characterState` block, after `characterPrompt(...)`, append the inventory block:

```ts
          const inventory = inventoryPrompt(characterState.characters, characterState.inventories ?? {});
          return [...(block.length ? [...block, ''] : []), ...(inventory.length ? [...inventory, ''] : [])];
```
(replace the previous `return block.length ? [...block, ''] : [];`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/inventory src/lib/round/assemblePrompt.test.ts`
Expected: PASS (existing assemblePrompt tests included: without `inventories` the block still renders for character state — `weight 0/10` lines only appear when `characterState` is passed; the "no character state" test above pins the other case).

---

### Task 6: Migration, starting kit, row mapping

**Files:**
- Create: `supabase/migrations/0008_inventory.sql`, `src/lib/inventory/rows.ts`, `src/lib/inventory/startingKit.ts`
- Modify: `src/lib/campaign/createCampaign.ts`, `src/lib/campaign/joinCampaign.ts`
- Test: `src/lib/inventory/rows.test.ts`, `src/lib/inventory/startingKit.test.ts`, `src/lib/campaign/joinCampaign.test.ts`

**Interfaces:**
- Produces: `InventoryRow` (`{ player_id: string; item_id: string; custom_name: string; quantity: number; slot: string | null; equipped: boolean }`), `rowsToItems(rows): InventoryItem[]`, `rowsToInventories(rows): Inventories`, `itemsToRows(campaignId, playerId, items)`; `seedStartingKit(supabase, params: { campaignId: string; playerId: string; weaponId: string }): Promise<void>`.

- [ ] **Step 1: Write the migration** (applied to the live DB in Task 11; nothing to run yet)

`supabase/migrations/0008_inventory.sql`:

```sql
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  item_id text not null,
  custom_name text not null default '',
  quantity int not null check (quantity > 0),
  slot text check (slot in ('weapon', 'armor')),
  equipped boolean not null default false,
  unique (player_id, item_id, custom_name)
);

-- At most one equipped weapon and one equipped armor per player, even if application code has a bug.
create unique index if not exists inventory_one_equipped_per_slot
  on inventory_items (player_id, slot) where equipped;

alter table inventory_items enable row level security;

-- Members read inventories. There is deliberately no insert/update/delete policy:
-- every write goes through the server with the service-role key.
drop policy if exists "members can view inventories" on inventory_items;
create policy "members can view inventories"
  on inventory_items for select
  using (is_campaign_member(inventory_items.campaign_id));

do $$
begin
  alter publication supabase_realtime add table inventory_items;
exception when duplicate_object then null;
end $$;

-- Drinking a potion is a round action naming the item; the server validates ownership.
alter table round_actions add column if not exists use_item_id text;

-- Existing players: their weapon becomes an equipped item, and everyone gets one minor potion.
insert into inventory_items (campaign_id, player_id, item_id, quantity, slot, equipped)
select campaign_id, id, weapon_id, 1, 'weapon', true
from players
where weapon_id in ('shortsword', 'shortbow', 'staff')
on conflict do nothing;

insert into inventory_items (campaign_id, player_id, item_id, quantity, slot, equipped)
select campaign_id, id, 'potion_minor', 1, null, false
from players
on conflict do nothing;
```

- [ ] **Step 2: Write the failing tests**

`src/lib/inventory/rows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { itemsToRows, rowsToInventories, rowsToItems } from './rows';

const rows = [
  { player_id: 'p1', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
  { player_id: 'p1', item_id: 'story', custom_name: 'Rusty Key', quantity: 1, slot: null, equipped: false },
  { player_id: 'p2', item_id: 'potion_minor', custom_name: '', quantity: 2, slot: null, equipped: false },
];

describe('inventory rows', () => {
  it('maps rows to items and groups them by player', () => {
    expect(rowsToItems(rows.slice(0, 1))).toEqual([{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true }]);
    const grouped = rowsToInventories(rows);
    expect(Object.keys(grouped).sort()).toEqual(['p1', 'p2']);
    expect(grouped.p1).toHaveLength(2);
    expect(grouped.p2[0].quantity).toBe(2);
  });

  it('treats an unknown slot value as no slot', () => {
    expect(rowsToItems([{ ...rows[0], slot: 'hat' }])[0].slot).toBeNull();
  });

  it('maps items back to rows for saving', () => {
    expect(itemsToRows('c1', 'p1', rowsToItems(rows.slice(0, 1)))).toEqual([
      { campaign_id: 'c1', player_id: 'p1', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
    ]);
  });
});
```

`src/lib/inventory/startingKit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { seedStartingKit } from './startingKit';

describe('seedStartingKit', () => {
  it('inserts the chosen weapon equipped plus one minor potion', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase: any = { from: vi.fn(() => ({ insert })) };

    await seedStartingKit(supabase, { campaignId: 'c1', playerId: 'p1', weaponId: 'shortbow' });

    expect(supabase.from).toHaveBeenCalledWith('inventory_items');
    expect(insert).toHaveBeenCalledWith([
      { campaign_id: 'c1', player_id: 'p1', item_id: 'shortbow', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
      { campaign_id: 'c1', player_id: 'p1', item_id: 'potion_minor', custom_name: '', quantity: 1, slot: null, equipped: false },
    ]);
  });

  it('throws when the insert fails', async () => {
    const supabase: any = { from: () => ({ insert: () => Promise.resolve({ error: new Error('boom') }) }) };
    await expect(seedStartingKit(supabase, { campaignId: 'c1', playerId: 'p1', weaponId: 'staff' })).rejects.toThrow('boom');
  });
});
```

In `joinCampaign.test.ts`, read the file first and extend its fake so a new player triggers a second `from('inventory_items').insert(...)` call, and add:

```ts
  it('gives a new player their starting kit but not an existing player', ...)
```
asserting `inventory_items` insert was called once for a new player with the chosen weapon and not called when the player already exists. (Match the file's existing fake style; the existing "returns existing player row" test must additionally assert the kit insert was **not** called.)

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/lib/inventory/rows.test.ts src/lib/inventory/startingKit.test.ts src/lib/campaign/joinCampaign.test.ts`
Expected: FAIL — modules missing / kit not seeded.

- [ ] **Step 4: Implement**

`src/lib/inventory/rows.ts`:

```ts
import type { Slot } from './catalog';
import type { Inventories, InventoryItem } from './types';

export interface InventoryRow {
  player_id: string;
  item_id: string;
  custom_name: string;
  quantity: number;
  slot: string | null;
  equipped: boolean;
}

export function rowsToItems(rows: InventoryRow[]): InventoryItem[] {
  return rows.map((r) => ({
    itemId: r.item_id,
    customName: r.custom_name ?? '',
    quantity: r.quantity,
    slot: r.slot === 'weapon' || r.slot === 'armor' ? (r.slot as Slot) : null,
    equipped: Boolean(r.equipped),
  }));
}

export function rowsToInventories(rows: InventoryRow[]): Inventories {
  const grouped: Inventories = {};
  for (const row of rows) (grouped[row.player_id] ??= []).push(...rowsToItems([row]));
  return grouped;
}

export function itemsToRows(campaignId: string, playerId: string, items: InventoryItem[]) {
  return items.map((i) => ({
    campaign_id: campaignId,
    player_id: playerId,
    item_id: i.itemId,
    custom_name: i.customName,
    quantity: i.quantity,
    slot: i.slot,
    equipped: i.equipped,
  }));
}
```

`src/lib/inventory/startingKit.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogEntry, slotOf } from './catalog';
import { itemsToRows } from './rows';
import type { InventoryItem } from './types';

/** Server-side only (service role): players never write their own inventory. */
export async function seedStartingKit(
  supabase: SupabaseClient,
  params: { campaignId: string; playerId: string; weaponId: string }
): Promise<void> {
  const weapon = catalogEntry(params.weaponId);
  const items: InventoryItem[] = [
    { itemId: params.weaponId, customName: '', quantity: 1, slot: weapon ? slotOf(weapon) : 'weapon', equipped: true },
    { itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false },
  ];
  const { error } = await supabase.from('inventory_items').insert(itemsToRows(params.campaignId, params.playerId, items));
  if (error) throw error;
}
```

`joinCampaign.ts` — after the successful player insert and before `return data;`:

```ts
  await seedStartingKit(supabase, { campaignId: params.campaignId, playerId: data.id, weaponId });
```
with `const weaponId = isStartingWeapon(params.weaponId) ? params.weaponId : DEFAULT_WEAPON_ID;` computed before the insert and reused there (the `weapon_id` column write stays for old deployments; it is no longer read). Do the same in `createCampaign.ts` after `playerError` is checked.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/inventory src/lib/campaign src/app/api`
Expected: PASS. If the route tests (`campaigns/route.test.ts`, join route test) fail because their Supabase fakes lack `inventory_items`, extend those fakes with an `insert` for that table — a failing insert is a real failure, not something to catch.

---

### Task 7: Repository — load and save inventories

**Files:**
- Modify: `src/lib/round/roundRepository.ts`, `src/lib/round/assemblePrompt.ts` (only if `RoundAction` fields are still missing)
- Test: `src/lib/round/roundRepository.test.ts`

**Interfaces:**
- Consumes: `rowsToInventories`, `itemsToRows`, `equippedWeaponId`, `armorReduction`, `Inventories`.
- Produces: `RoundContext.inventories: Inventories`; `RoundContext.characters[].weaponId` is now the equipped weapon (or `null`) and `armorReduction` is set; `RoundContext.actions[]` carry `playerId` and `useItemId`; `RoundRepository.saveInventories(campaignId: string, changes: { playerId: string; items: InventoryItem[] }[]): Promise<void>` (per player: delete rows that are no longer present, then upsert the rest with `onConflict: 'player_id,item_id,custom_name'`).

- [ ] **Step 1: Write the failing tests**

In `roundRepository.test.ts`, extend `createFakeSupabase` options with `inventoryRows?: unknown[]` and `actionRows?: unknown[]`, make the fake's `round_actions` select return `options.actionRows ?? []`, and add an `inventory_items` table branch:

```ts
      if (table === 'inventory_items') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: options.inventoryRows ?? [], error: null }) }),
        };
      }
```

Add tests:

```ts
  it('derives weapon and armor from the equipped inventory and returns the inventories', async () => {
    const supabase = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      players: [{ id: 'p1', display_name: 'Prem', weapon_id: 'staff', hp: 20, max_hp: 20, status: 'active', revives_since_sanctuary: 0 }],
      inventoryRows: [
        { player_id: 'p1', item_id: 'shortbow', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
        { player_id: 'p1', item_id: 'armor_medium', custom_name: '', quantity: 1, slot: 'armor', equipped: true },
      ],
    }).client;
    const context = await createSupabaseRoundRepository(supabase).getRoundContext('r1');
    expect(context.characters[0]).toMatchObject({ weaponId: 'shortbow', armorReduction: 2 });
    expect(context.inventories.p1).toHaveLength(2);
  });

  it('treats a player with nothing equipped as bare-handed (the old weapon_id column is ignored)', async () => {
    const supabase = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      players: [{ id: 'p1', display_name: 'Prem', weapon_id: 'staff', hp: 20, max_hp: 20, status: 'active', revives_since_sanctuary: 0 }],
    }).client;
    const context = await createSupabaseRoundRepository(supabase).getRoundContext('r1');
    expect(context.characters[0]).toMatchObject({ weaponId: null, armorReduction: 0 });
  });

  it('carries player id and the potion being drunk on each action', async () => {
    const supabase = createFakeSupabase({
      roundsById: { r1: { campaign_id: 'c1' } },
      campaignSummary: null,
      actionRows: [{ action_text: 'ดื่มยา', use_item_id: 'potion_minor', player_id: 'p1', players: { display_name: 'Prem', turn_order: 1, created_at: '2026-01-01' } }],
    }).client;
    const context = await createSupabaseRoundRepository(supabase).getRoundContext('r1');
    expect(context.actions).toEqual([{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', useItemId: 'potion_minor' }]);
  });
```

And a `saveInventories` test with a recording fake:

```ts
describe('saveInventories', () => {
  it('deletes rows no longer present, then upserts the rest keyed by player, item and title', async () => {
    const calls: string[] = [];
    const client: any = {
      from: (table: string) => {
        expect(table).toBe('inventory_items');
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [
            { id: 'a', item_id: 'potion_minor', custom_name: '' },
            { id: 'b', item_id: 'story', custom_name: 'Rusty Key' },
          ], error: null }) }),
          delete: () => ({ in: (col: string, ids: string[]) => { calls.push(`delete ${col} ${ids.join(',')}`); return Promise.resolve({ error: null }); } }),
          upsert: (rows: unknown[], opts: unknown) => { calls.push(`upsert ${JSON.stringify(rows)} ${JSON.stringify(opts)}`); return Promise.resolve({ error: null }); },
        };
      },
    };
    await createSupabaseRoundRepository(client).saveInventories('c1', [
      { playerId: 'p1', items: [{ itemId: 'potion_minor', customName: '', quantity: 2, slot: null, equipped: false }] },
    ]);
    expect(calls[0]).toBe('delete id b');
    expect(calls[1]).toContain('"item_id":"potion_minor"');
    expect(calls[1]).toContain('"quantity":2');
    expect(calls[1]).toContain('"onConflict":"player_id,item_id,custom_name"');
  });

  it('skips the upsert for a player left with nothing and surfaces a write error', async () => {
    const client: any = {
      from: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'a', item_id: 'potion_minor', custom_name: '' }], error: null }) }),
        delete: () => ({ in: () => Promise.resolve({ error: new Error('nope') }) }),
        upsert: () => { throw new Error('should not upsert an empty pack'); },
      }),
    };
    await expect(createSupabaseRoundRepository(client).saveInventories('c1', [{ playerId: 'p1', items: [] }])).rejects.toThrow('nope');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/round/roundRepository.test.ts`
Expected: FAIL — `inventories` undefined, `saveInventories` missing.

- [ ] **Step 3: Implement**

`roundRepository.ts`:
- imports: `rowsToInventories, itemsToRows, type InventoryRow` from `@/lib/inventory/rows`; `equippedWeaponId, armorReduction` from `@/lib/inventory/rules`; `type Inventories, type InventoryItem` from `@/lib/inventory/types`.
- `RoundContext` add `inventories: Inventories;`.
- `RoundRepository` add `saveInventories(campaignId: string, changes: { playerId: string; items: InventoryItem[] }[]): Promise<void>;`.
- In `getRoundContext`, after `characterRows`:

```ts
      const { data: inventoryRows } = await supabase
        .from('inventory_items')
        .select('player_id, item_id, custom_name, quantity, slot, equipped')
        .eq('campaign_id', campaignId);
      const inventories = rowsToInventories((inventoryRows ?? []) as InventoryRow[]);
```
- The `round_actions` select becomes `'action_text, use_item_id, player_id, players(display_name, turn_order, created_at)'`.
- The `characters` mapper: replace `weaponId: (row.weapon_id ?? null) as string | null,` with

```ts
          weaponId: equippedWeaponId(inventories[row.id] ?? []),
          armorReduction: armorReduction(inventories[row.id] ?? []),
```
- Return `inventories`, and the actions mapper keeps `playerId`/`useItemId`:

```ts
          (actionsRows ?? []).map((row: any) => ({
            playerDisplayName: row.players?.display_name ?? 'Unknown',
            actionText: row.action_text as string,
            playerId: row.player_id as string,
            useItemId: (row.use_item_id ?? null) as string | null,
            turnOrder: (row.players?.turn_order ?? null) as number | null,
            joinedAt: (row.players?.created_at ?? '') as string,
          }))
        ).map(({ playerDisplayName, actionText, playerId, useItemId }) => ({ playerDisplayName, actionText, playerId, useItemId })),
```
- New method:

```ts
    async saveInventories(campaignId, changes) {
      for (const { playerId, items } of changes) {
        const keep = new Set(items.map((i) => `${i.itemId}|${i.customName}`));
        const { data: existing, error: readError } = await supabase
          .from('inventory_items')
          .select('id, item_id, custom_name')
          .eq('player_id', playerId);
        if (readError) throw readError;
        // Remove first: the one-equipped-per-slot index would reject a new equipped row while the old one exists.
        const stale = (existing ?? [])
          .filter((r: any) => !keep.has(`${r.item_id}|${r.custom_name}`))
          .map((r: any) => r.id as string);
        if (stale.length) {
          const { error } = await supabase.from('inventory_items').delete().in('id', stale);
          if (error) throw error;
        }
        if (items.length) {
          const { error } = await supabase
            .from('inventory_items')
            .upsert(itemsToRows(campaignId, playerId, items), { onConflict: 'player_id,item_id,custom_name' });
          if (error) throw error;
        }
      }
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/round/roundRepository.test.ts`
Expected: PASS. (`tsc` errors in `processRound.test.ts` fakes are expected until Task 8.)

---

### Task 8: Wire inventory into `processRound`

**Files:**
- Modify: `src/lib/round/processRound.ts`
- Test: `src/lib/round/processRound.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: no new exports. Behavior: potion actions resolve before narration (prompt shows real HP and a `(server: …)` note); after narration, HP tags then give/take tags apply; changed inventories are saved; one `stats` message carries all lines in this order: potion lines, HP lines, inventory lines.

- [ ] **Step 1: Write the failing tests**

In `processRound.test.ts`: add `saveInventories: vi.fn().mockResolvedValue(undefined)` and `inventories: {}` to `createFakeRepository`'s defaults, then add tests (use the file's existing helpers `fakeStream`, `createFakeRepository`; `rollSides: () => 4` makes 1d6+1 = 5, 2d6 = 8):

```ts
const prem = { id: 'p1', displayName: 'Prem', weaponId: 'shortsword', hp: 10, maxHp: 20, status: 'active' as const, revivesSinceSanctuary: 0 };
const potion = { itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false };
const contextWith = (over: object) => ({
  campaignId: 'camp-1', campaignSummary: '', recentMessages: [], pendingWipe: false,
  characters: [prem], inventories: { p1: [potion] },
  actions: [{ playerDisplayName: 'Prem', actionText: 'ดื่มยา', playerId: 'p1', useItemId: 'potion_minor' }],
  ...over,
});

describe('processRound inventory', () => {
  it('resolves a potion before narration: prompt shows the healed HP and note, item is consumed, log line posted', async () => {
    const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(contextWith({})) });
    const generateNarration = vi.fn().mockResolvedValue(fakeStream(['เล่าเรื่อง']));
    await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration, rollDie: () => 7, rollSides: () => 4 }, 'round-1');

    const prompt = generateNarration.mock.calls[0][0] as string;
    expect(prompt).toContain('HP 15/20');
    expect(prompt).toContain('(server: drank ยาฟื้นฟูเล็ก and recovered 5 HP)');
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [{ playerId: 'p1', items: [] }]);
    expect(repository.saveCharacterState).toHaveBeenCalledWith('camp-1', [expect.objectContaining({ id: 'p1', hp: 15 })], false);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem ดื่ม ยาฟื้นฟูเล็ก (+5 HP)']);
  });

  it('ignores a potion the player does not own and still runs the round', async () => {
    const repository = createFakeRepository({ getRoundContext: vi.fn().mockResolvedValue(contextWith({ inventories: { p1: [] } })) });
    const result = await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['ok'])), rollSides: () => 4 }, 'round-1');
    expect(result.processed).toBe(true);
    expect(repository.saveInventories).not.toHaveBeenCalled();
  });

  it('applies give and take tags, strips them from the narration, and lists them after the HP lines', async () => {
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({ actions: [{ playerDisplayName: 'Prem', actionText: 'สำรวจ', playerId: 'p1', useItemId: null }], inventories: { p1: [potion] } })),
    });
    const narration = 'เจอของ\n[[hurt: Prem | light]]\n[[give: Prem | story: Rusty Key]]\n[[take: Prem | potion_minor]]';
    await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream([narration])), rollSides: () => 4 }, 'round-1');

    expect(repository.appendToMessage).toHaveBeenCalledWith('msg-1', 'เจอของ');
    expect(repository.saveInventories).toHaveBeenCalledWith('camp-1', [
      { playerId: 'p1', items: [{ itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false }] },
    ]);
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem −4 HP', 'Prem ได้รับ Rusty Key', 'Prem เสียไป ยาฟื้นฟูเล็ก']);
  });

  it('applies armor to hurt tags using the character armorReduction', async () => {
    const armored = { ...prem, hp: 20, armorReduction: 2 };
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({ characters: [armored], inventories: {}, actions: [{ playerDisplayName: 'Prem', actionText: 'สู้', playerId: 'p1', useItemId: null }] })),
    });
    await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['[[hurt: Prem | medium]]'])), rollSides: () => 4 }, 'round-1');
    expect(repository.insertStatsSummary).toHaveBeenCalledWith('camp-1', 'round-1', ['Prem −3 HP (เกราะกัน 2)']);
  });

  it('still closes the round when saving inventories fails', async () => {
    const repository = createFakeRepository({
      getRoundContext: vi.fn().mockResolvedValue(contextWith({})),
      saveInventories: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const result = await processRound({ claimRound: vi.fn().mockResolvedValue(true), repository, generateNarration: vi.fn().mockResolvedValue(fakeStream(['ok'])), rollSides: () => 4 }, 'round-1');
    expect(result).toMatchObject({ processed: true, nextRoundId: 'round-2' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/round/processRound.test.ts`
Expected: FAIL — potion not applied, tags not applied.

- [ ] **Step 3: Implement**

In `processRound.ts`:
- imports: `applyPotionActions, applyInventoryTags` from `@/lib/inventory/apply`; `type Inventories` from `@/lib/inventory/types`; `type Character` from `@/lib/character/types`.
- declare next to the other `let`s: `let potions: ReturnType<typeof applyPotionActions>;`
- inside the first `try`, right after `const rollSides = ...`:

```ts
    // Potions resolve before narration so the DM sees the real HP; nothing is saved until the end,
    // so a failed generation leaves the potion untouched for the retry.
    potions = applyPotionActions(context.characters, context.inventories, context.actions, rollSides);
```
- in the `rolled` mapper, add the note when the action is a resolved potion, e.g. build `const withNote = (a) => ({ ...a, note: a.playerId ? potions.notes[a.playerId] : undefined })` and use `...withNote(a)` in place of `...a` in all three returns (keep field order irrelevant).
- the `assemblePrompt` call's last argument becomes `{ characters: potions.characters, pendingWipe: context.pendingWipe, inventories: potions.inventories }`.
- replace the best-effort block after narration with:

```ts
  if (context.characters.length > 0) {
    try {
      const result = applyCharacterTags(potions.characters, tags, deps.rollSides ?? randomDie);
      const inventoryResult = applyInventoryTags(result.characters, potions.inventories, tags);
      await deps.repository.saveCharacterState(context.campaignId, result.characters, result.wiped);
      const changedIds = [...new Set([...potions.changedPlayerIds, ...inventoryResult.changedPlayerIds])];
      if (changedIds.length > 0) {
        await deps.repository.saveInventories(
          context.campaignId,
          changedIds.map((playerId) => ({ playerId, items: inventoryResult.inventories[playerId] ?? [] }))
        );
      }
      await deps.repository.insertStatsSummary(context.campaignId, roundId, [
        ...potions.changes,
        ...result.changes,
        ...inventoryResult.changes,
      ]);
    } catch {
      /* the narration is already posted; the next round reads whatever state was saved */
    }
  }
```
(The HP state is saved first on purpose: if only the inventory write fails, a potion heals without being consumed, which is better for the player than being consumed without healing.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/round` then `npx vitest run` then `npx tsc --noEmit`
Expected: PASS everywhere; `tsc` shows only the 2 known stale `.next/types` errors.

---

### Task 9: Equip route (server)

**Files:**
- Create: `src/lib/inventory/equipItem.ts`, `src/app/api/campaigns/[id]/inventory/equip/route.ts`
- Test: `src/lib/inventory/equipItem.test.ts`, `src/app/api/campaigns/[id]/inventory/equip/route.test.ts`

**Interfaces:**
- Produces: `class EquipError extends Error { status: 400 | 403 }`; `equipForUser(supabase, params: { campaignId: string; userId: string; itemId: string; action: 'equip' | 'unequip' }): Promise<InventoryItem[]>` — resolves the caller's player row, applies the rule, writes with unequips before equips; `POST /api/campaigns/[id]/inventory/equip` with `Authorization: Bearer <token>` and body `{ itemId, action }` returning `{ items }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/inventory/equipItem.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EquipError, equipForUser } from './equipItem';

const sword = { player_id: 'p1', item_id: 'shortsword', custom_name: '', quantity: 1, slot: 'weapon', equipped: true };
const bow = { player_id: 'p1', item_id: 'shortbow', custom_name: '', quantity: 1, slot: 'weapon', equipped: false };

function fakeSupabase(options: { player: { id: string } | null; rows: unknown[] }) {
  const updates: { patch: unknown; filters: Record<string, string> }[] = [];
  const client: any = {
    from(table: string) {
      if (table === 'players') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: options.player, error: null }) }) }) }) };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: options.rows, error: null }) }),
        update: (patch: unknown) => {
          const filters: Record<string, string> = {};
          const builder: any = {
            eq: (column: string, value: string) => { filters[column] = value; return builder; },
            then: (resolve: (v: unknown) => unknown) => { updates.push({ patch, filters }); return Promise.resolve({ error: null }).then(resolve); },
          };
          return builder;
        },
      };
    },
  };
  return { client, updates };
}

const params = { campaignId: 'c1', userId: 'u1' };

describe('equipForUser', () => {
  it('swaps the equipped weapon, unequipping the old one before equipping the new one', async () => {
    const { client, updates } = fakeSupabase({ player: { id: 'p1' }, rows: [sword, bow] });
    const items = await equipForUser(client, { ...params, itemId: 'shortbow', action: 'equip' });
    expect(updates.map((u) => [u.filters.item_id, (u.patch as any).equipped])).toEqual([['shortsword', false], ['shortbow', true]]);
    expect(items.find((i) => i.itemId === 'shortbow')!.equipped).toBe(true);
  });

  it('unequips an equipped item', async () => {
    const { client, updates } = fakeSupabase({ player: { id: 'p1' }, rows: [sword] });
    await equipForUser(client, { ...params, itemId: 'shortsword', action: 'unequip' });
    expect(updates).toHaveLength(1);
    expect((updates[0].patch as any).equipped).toBe(false);
  });

  it('rejects a caller who is not a player in this campaign', async () => {
    const { client } = fakeSupabase({ player: null, rows: [] });
    await expect(equipForUser(client, { ...params, itemId: 'shortsword', action: 'equip' })).rejects.toMatchObject({ status: 403 });
  });

  it('rejects equipping something not owned or without a slot, and unequipping something not worn', async () => {
    const { client } = fakeSupabase({ player: { id: 'p1' }, rows: [sword, { ...bow, item_id: 'potion_minor', slot: null }] });
    await expect(equipForUser(client, { ...params, itemId: 'staff', action: 'equip' })).rejects.toBeInstanceOf(EquipError);
    await expect(equipForUser(client, { ...params, itemId: 'potion_minor', action: 'equip' })).rejects.toBeInstanceOf(EquipError);
    await expect(equipForUser(client, { ...params, itemId: 'potion_minor', action: 'unequip' })).rejects.toBeInstanceOf(EquipError);
  });
});
```

`src/app/api/campaigns/[id]/inventory/equip/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, equipForUser } = vi.hoisted(() => ({ getUser: vi.fn(), equipForUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/inventory/equipItem', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/inventory/equipItem')>()), equipForUser }));

import { POST } from './route';
import { EquipError } from '@/lib/inventory/equipItem';

const call = (body: unknown, token?: string) =>
  POST(
    new NextRequest('http://localhost/api/campaigns/c1/inventory/equip', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'c1' }) }
  );

describe('POST equip', () => {
  beforeEach(() => { getUser.mockReset(); equipForUser.mockReset(); });

  it('rejects a bad body with 400', async () => {
    expect((await call({ action: 'equip' }, 't')).status).toBe(400);
    expect((await call({ itemId: 'shortbow', action: 'wear' }, 't')).status).toBe(400);
  });

  it('requires a signed-in caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await call({ itemId: 'shortbow', action: 'equip' })).status).toBe(401);
  });

  it('equips for the authenticated user and returns the items', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    equipForUser.mockResolvedValue([{ itemId: 'shortbow' }]);
    const response = await call({ itemId: 'shortbow', action: 'equip' }, 't');
    expect(equipForUser).toHaveBeenCalledWith(expect.anything(), { campaignId: 'c1', userId: 'u1', itemId: 'shortbow', action: 'equip' });
    expect(await response.json()).toEqual({ items: [{ itemId: 'shortbow' }] });
  });

  it('maps an EquipError to its status', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    equipForUser.mockRejectedValue(new EquipError('nope', 403));
    expect((await call({ itemId: 'shortbow', action: 'equip' }, 't')).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/inventory/equipItem.test.ts "src/app/api/campaigns/[id]/inventory"`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`src/lib/inventory/equipItem.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { equipItem, unequipSlot } from './rules';
import { rowsToItems, type InventoryRow } from './rows';
import type { InventoryItem } from './types';

export class EquipError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 = 400
  ) {
    super(message);
  }
}

export async function equipForUser(
  supabase: SupabaseClient,
  params: { campaignId: string; userId: string; itemId: string; action: 'equip' | 'unequip' }
): Promise<InventoryItem[]> {
  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', params.campaignId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!player) throw new EquipError('not a player in this campaign', 403);

  const { data: rows, error } = await supabase
    .from('inventory_items')
    .select('player_id, item_id, custom_name, quantity, slot, equipped')
    .eq('player_id', player.id);
  if (error) throw error;

  const before = rowsToItems((rows ?? []) as InventoryRow[]);
  let after: InventoryItem[];
  if (params.action === 'equip') {
    const result = equipItem(before, params.itemId);
    if (!result.ok) throw new EquipError('cannot equip that item');
    after = result.items;
  } else {
    const worn = before.find((i) => i.itemId === params.itemId && i.equipped && i.slot);
    if (!worn?.slot) throw new EquipError('that item is not equipped');
    after = unequipSlot(before, worn.slot);
  }

  const flips = after.filter((a) => before.some((b) => b.itemId === a.itemId && b.customName === a.customName && b.equipped !== a.equipped));
  // Unequip first: the one-equipped-per-slot index rejects two equipped rows at once.
  for (const flip of [...flips.filter((f) => !f.equipped), ...flips.filter((f) => f.equipped)]) {
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ equipped: flip.equipped })
      .eq('player_id', player.id)
      .eq('item_id', flip.itemId)
      .eq('custom_name', flip.customName);
    if (updateError) throw updateError;
  }
  return after;
}
```

`route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EquipError, equipForUser } from '@/lib/inventory/equipItem';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!body.itemId || (body.action !== 'equip' && body.action !== 'unequip')) {
    return NextResponse.json({ error: "itemId and action ('equip' | 'unequip') are required" }, { status: 400 });
  }

  // Identify the caller from their Supabase session instead of trusting ids in the body.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const supabase = createServiceRoleClient();
  const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  if (!authData.user) {
    return NextResponse.json({ error: 'sign in required' }, { status: 401 });
  }

  try {
    const items = await equipForUser(supabase, {
      campaignId: id,
      userId: authData.user.id,
      itemId: body.itemId,
      action: body.action,
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof EquipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/inventory "src/app/api/campaigns/[id]/inventory"`
Expected: PASS.

---

### Task 10: Client data layer, drink action, PlayerOrder gear

**Files:**
- Create: `src/lib/supabase/inventory.ts`
- Modify: `src/lib/supabase/players.ts`, `src/lib/supabase/submitAction.ts`, `src/components/PlayerOrder.tsx`, `src/components/ActionInput.tsx`
- Test: `src/components/PlayerOrder.test.tsx`, `src/components/ActionInput.test.tsx`, `src/components/CampaignLobby.test.tsx` (fixtures only)

**Interfaces:**
- Consumes: `rowsToInventories`, `equippedWeaponId`, `equippedArmorId`, `catalogEntry`.
- Produces: `RoundPlayer` loses `weaponId` and gains `items: InventoryItem[]`; `fetchCampaignInventories(campaignId): Promise<Inventories>`; `subscribeToInventory(campaignId, onChange): () => void`; `requestEquip(campaignId, itemId, action): Promise<void>`; `submitAction(roundId, playerId, actionText, useItemId?)`; `ActionInput` prop `alreadyActed?: boolean`.

- [ ] **Step 1: Write the failing tests**

`PlayerOrder.test.tsx` — replace the `character` fixture with `{ hp: 20, maxHp: 20, status: 'active' as const, items: [{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon' as const, equipped: true }] }` and add:

```ts
  it('shows the equipped weapon and armor, and bare hands when nothing is equipped', () => {
    const armored = { ...players[0], items: [
      { itemId: 'shortbow', customName: '', quantity: 1, slot: 'weapon' as const, equipped: true },
      { itemId: 'armor_heavy', customName: '', quantity: 1, slot: 'armor' as const, equipped: true },
    ] };
    const bare = { ...players[1], items: [] };
    render(<PlayerOrder players={[armored, bare, players[2]]} currentPlayerId="p1" locked={false} onMove={() => {}} />);
    expect(screen.getByText(/ธนูสั้น/)).toBeTruthy();
    expect(screen.getByText(/เกราะเหล็ก/)).toBeTruthy();
    expect(screen.getByText(/มือเปล่า/)).toBeTruthy();
  });
```

`ActionInput.test.tsx`:

```ts
  it('locks everything and says so when the player has already acted this round (for example by drinking a potion)', () => {
    render(<ActionInput onSubmit={vi.fn()} alreadyActed />);
    expect(screen.getByText(/ส่ง action แล้ว/)).toBeTruthy();
    expect((screen.getByLabelText('free text action') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'โจมตี' }) as HTMLButtonElement).disabled).toBe(true);
  });
```

Update `CampaignLobby.test.tsx` fixture: `weaponId: ...` → `items: []`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/PlayerOrder.test.tsx src/components/ActionInput.test.tsx src/components/CampaignLobby.test.tsx`
Expected: FAIL — items not rendered, `alreadyActed` unknown.

- [ ] **Step 3: Implement**

`src/lib/supabase/inventory.ts`:

```ts
import { supabaseBrowserClient } from './client';
import { rowsToInventories, type InventoryRow } from '@/lib/inventory/rows';
import type { Inventories } from '@/lib/inventory/types';

export async function fetchCampaignInventories(campaignId: string): Promise<Inventories> {
  const { data, error } = await supabaseBrowserClient
    .from('inventory_items')
    .select('player_id, item_id, custom_name, quantity, slot, equipped')
    .eq('campaign_id', campaignId);
  if (error) throw error;
  return rowsToInventories((data ?? []) as InventoryRow[]);
}

export function subscribeToInventory(campaignId: string, onChange: () => void): () => void {
  const channel = supabaseBrowserClient
    .channel(`inventory:${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'inventory_items', filter: `campaign_id=eq.${campaignId}` },
      onChange
    )
    .subscribe();
  return () => {
    supabaseBrowserClient.removeChannel(channel);
  };
}

export async function requestEquip(
  campaignId: string,
  itemId: string,
  action: 'equip' | 'unequip'
): Promise<void> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  const response = await fetch(`/api/campaigns/${campaignId}/inventory/equip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ itemId, action }),
  });
  if (!response.ok) throw new Error('could not change equipment');
}
```

`players.ts`: import `fetchCampaignInventories`, `type InventoryItem`; in `RoundPlayer` replace `weaponId: string | null;` with `items: InventoryItem[];`; drop `weapon_id` from the select and the row mapping; after the players query:

```ts
  // A database without the inventory table (migration not applied yet) plays with empty packs.
  const inventories = await fetchCampaignInventories(campaignId).catch(() => ({}) as Inventories);
```
(import `type Inventories`), keep `id` on each row, and map `items: inventories[p.id] ?? []` into both mapped shapes (rows and the returned `RoundPlayer`).

`submitAction.ts`:

```ts
export async function submitAction(
  roundId: string,
  playerId: string,
  actionText: string,
  useItemId?: string
): Promise<void> {
  const { error } = await supabaseBrowserClient
    .from('round_actions')
    .insert({
      round_id: roundId,
      player_id: playerId,
      action_text: actionText,
      ...(useItemId ? { use_item_id: useItemId } : {}),
    });
  if (error) throw error;
}
```

`PlayerOrder.tsx`: replace the `weaponFor(player.weaponId).nameTh` span with

```tsx
                <span className="wpn">
                  {' '}
                  · {weaponFor(equippedWeaponId(player.items)).nameTh}
                  {equippedArmorId(player.items) ? ` · ${catalogEntry(equippedArmorId(player.items)!)?.nameTh}` : ''}
                </span>
```
importing `equippedWeaponId, equippedArmorId` from `@/lib/inventory/rules` and `catalogEntry` from `@/lib/inventory/catalog`.

`ActionInput.tsx`: add prop `alreadyActed?: boolean`; `locked = submitted || submitting || Boolean(disabledReason) || Boolean(alreadyActed)`; the guard in `handleSubmit` also returns on `alreadyActed`; show the OK line when `submitted || alreadyActed`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: PASS; `tsc` reports errors only for the campaign page's use of removed `weaponId` if any (there should be none) plus the 2 known stale ones.

---

### Task 11: Inventory panel and game screen wiring

**Files:**
- Create: `src/components/Inventory.tsx`
- Modify: `src/app/campaign/[id]/page.tsx`, `src/app/globals.css`
- Test: `src/components/Inventory.test.tsx`

**Interfaces:**
- Consumes: `InventoryItem`, `weightOf`, `itemLabel`, `CARRY_CAPACITY`, `catalogEntry`, `requestEquip`, `subscribeToInventory`, `submitAction`.
- Produces: `Inventory` component with props `{ items: InventoryItem[]; canAct: boolean; onEquip: (itemId: string, action: 'equip' | 'unequip') => void; onDrink: (itemId: string) => void }`.

- [ ] **Step 1: Write the failing tests**

`src/components/Inventory.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inventory } from './Inventory';
import type { InventoryItem } from '@/lib/inventory/types';

const sword: InventoryItem = { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true };
const bow: InventoryItem = { itemId: 'shortbow', customName: '', quantity: 1, slot: 'weapon', equipped: false };
const potion: InventoryItem = { itemId: 'potion_minor', customName: '', quantity: 2, slot: null, equipped: false };
const key: InventoryItem = { itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false };

describe('Inventory', () => {
  it('shows the weight and every item with its quantity and worn state', () => {
    render(<Inventory items={[sword, bow, potion, key]} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('น้ำหนัก 6/10')).toBeTruthy(); // 2 + 2 + 2 potions + 0 for the story key
  });

  it('says the pack is empty', () => {
    render(<Inventory items={[]} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('กระเป๋าว่าง')).toBeTruthy();
  });

  it('equips a spare weapon and unequips the worn one', () => {
    const onEquip = vi.fn();
    render(<Inventory items={[sword, bow]} canAct onEquip={onEquip} onDrink={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'สวม ธนูสั้น' }));
    expect(onEquip).toHaveBeenCalledWith('shortbow', 'equip');
    fireEvent.click(screen.getByRole('button', { name: 'ถอด ดาบสั้น' }));
    expect(onEquip).toHaveBeenCalledWith('shortsword', 'unequip');
  });

  it('drinks a potion, and locks drinking (but not equipping) when the player cannot act', () => {
    const onDrink = vi.fn();
    const { rerender } = render(<Inventory items={[potion]} canAct onEquip={() => {}} onDrink={onDrink} />);
    fireEvent.click(screen.getByRole('button', { name: 'ดื่ม ยาฟื้นฟูเล็ก' }));
    expect(onDrink).toHaveBeenCalledWith('potion_minor');

    rerender(<Inventory items={[potion, bow]} canAct={false} onEquip={() => {}} onDrink={onDrink} />);
    expect((screen.getByRole('button', { name: 'ดื่ม ยาฟื้นฟูเล็ก' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'สวม ธนูสั้น' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('gives story items no buttons', () => {
    render(<Inventory items={[key]} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('Rusty Key')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/Inventory.test.tsx`
Expected: FAIL — cannot resolve `./Inventory`.

- [ ] **Step 3: Implement**

`src/components/Inventory.tsx`:

```tsx
import { CARRY_CAPACITY, catalogEntry } from '@/lib/inventory/catalog';
import { itemLabel, weightOf } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';

export interface InventoryProps {
  items: InventoryItem[];
  /** False when downed or already acted this round: drinking takes the action. Equipping is always free. */
  canAct: boolean;
  onEquip: (itemId: string, action: 'equip' | 'unequip') => void;
  onDrink: (itemId: string) => void;
}

export function Inventory({ items, canAct, onEquip, onDrink }: InventoryProps) {
  const weight = weightOf(items);
  return (
    <section className="card" aria-label="กระเป๋า">
      <h3>กระเป๋า</h3>
      <div className="inv-weight">
        <div className="hp-track" aria-hidden="true">
          <i className="hp-fill" style={{ width: `${Math.min(100, (weight / CARRY_CAPACITY) * 100)}%` }} />
        </div>
        <span className="hp-num">น้ำหนัก {weight}/{CARRY_CAPACITY}</span>
      </div>
      {items.length === 0 ? (
        <p className="status">กระเป๋าว่าง</p>
      ) : (
        <ul className="inv-list">
          {items.map((item) => {
            const label = itemLabel(item);
            const kind = catalogEntry(item.itemId)?.kind;
            return (
              <li key={`${item.itemId}|${item.customName}`} className="inv-row">
                <span className="inv-name">
                  {label}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  {item.equipped && <b className="badge-worn">สวมอยู่</b>}
                </span>
                {(kind === 'weapon' || kind === 'armor') && (
                  <button
                    type="button"
                    className="qa"
                    aria-label={`${item.equipped ? 'ถอด' : 'สวม'} ${label}`}
                    onClick={() => onEquip(item.itemId, item.equipped ? 'unequip' : 'equip')}
                  >
                    {item.equipped ? 'ถอด' : 'สวม'}
                  </button>
                )}
                {kind === 'consumable' && (
                  <button
                    type="button"
                    className="qa"
                    aria-label={`ดื่ม ${label}`}
                    disabled={!canAct}
                    onClick={() => onDrink(item.itemId)}
                  >
                    ดื่ม
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

`src/app/campaign/[id]/page.tsx`:
- imports: `Inventory`, `requestEquip`, `subscribeToInventory`, `itemLabel`, `catalogEntry`-free.
- next to `refreshPlayers` effect: `useEffect(() => subscribeToInventory(campaignId, refreshPlayers), [campaignId, refreshPlayers]);`
- derive `const me = players.find((p) => p.id === playerId);` (reuse instead of repeated finds is optional; only add for the new code).
- `handleEquip`:

```tsx
  async function handleEquip(itemId: string, action: 'equip' | 'unequip') {
    try {
      await requestEquip(campaignId, itemId, action);
    } finally {
      refreshPlayers();
    }
  }
```
  (a failed request is silent apart from the refresh restoring the true state; the buttons are simple enough that no error banner is needed.)
- `handleDrink(itemId)`:

```tsx
  async function handleDrink(itemId: string) {
    if (!roundId) return;
    const item = me?.items.find((i) => i.itemId === itemId);
    try {
      await submitAction(roundId, playerId, `ดื่ม${item ? itemLabel(item) : 'ยา'}`, itemId);
    } finally {
      refreshPlayers();
    }
  }
```
- `<ActionInput ... alreadyActed={me?.acted ?? false} />`.
- in the rail, under `PlayerOrder`:

```tsx
          {me && (
            <Inventory
              items={me.items}
              canAct={me.status === 'active' && !me.acted}
              onEquip={handleEquip}
              onDrink={handleDrink}
            />
          )}
```

`globals.css` — append (reusing the existing `hp-track`/`hp-fill`/`qa`/`badge-down` look):

```css
.inv-weight { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.inv-weight .hp-track { flex: 1; }
.inv-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.inv-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.inv-name { min-width: 0; overflow-wrap: anywhere; }
.badge-worn { margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 0.7rem; background: rgba(95, 179, 165, 0.2); color: #5fb3a5; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: PASS (all suites); `tsc` only the 2 known stale errors.

---

### Task 12: Apply the migration, verify live, final check

**Files:** none new (live verification). Uses Claude in Chrome for Supabase (already logged in) and the user's running `npm run dev` on localhost. **Never run `npm run build` or touch `.next`.**

- [ ] **Step 1: Apply `0008_inventory.sql`** in the Supabase SQL editor via Claude in Chrome. Supabase will warn about the destructive-looking `drop policy if exists`; that warning is expected and safe (it drops a policy that does not exist yet). Expected: "Success. No rows returned".

- [ ] **Step 2: Verify the schema and backfill** with one query in the editor:

```sql
select p.display_name, i.item_id, i.equipped, i.quantity
from players p join inventory_items i on i.player_id = p.id
order by p.display_name, i.item_id;
```
Expected: every existing player has their old weapon row `equipped = true` and one `potion_minor`. Also confirm `select column_name from information_schema.columns where table_name = 'round_actions' and column_name = 'use_item_id';` returns a row.

- [ ] **Step 3: Live playthrough on localhost** (in the browser pane): create a campaign, start it, and confirm the rail shows the กระเป๋า card with the chosen weapon `สวมอยู่`, one ยาฟื้นฟูเล็ก, and `น้ำหนัก 3/10`; the player card shows the weapon name; swap nothing yet. Press ดื่ม on the potion: the action locks the input, the round processes, the stats line shows `ดื่ม ยาฟื้นฟูเล็ก (+N HP)` (`+0 HP` at full health is correct), the potion is gone and the DM reply matches. Then, in a second round, confirm that hurting damage lines can show `(เกราะกัน N)` only once armor exists (armor arrives from the AI's `give` tag or can be inserted for the test through the SQL editor: `insert into inventory_items (campaign_id, player_id, item_id, quantity, slot, equipped) select campaign_id, id, 'armor_light', 1, 'armor', true from players where display_name = '<test player>'`), and press สวม/ถอด on a spare weapon and see the player card change without a reload.

- [ ] **Step 4: Full suite and type check**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all tests pass; only the 2 known stale `.next/types` errors.

- [ ] **Step 5: Report to the user, then ask** whether to commit (and deploy). Do not commit or deploy without the answer.
