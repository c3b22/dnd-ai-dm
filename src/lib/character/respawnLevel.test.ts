import { describe, it, expect } from 'vitest';
import { respawnLevel } from './respawnLevel';

describe('respawnLevel', () => {
  it('averages friends levels rounded down with a minimum of 1', () => {
    expect(respawnLevel([{ xp: 270 }, { xp: 420 }])).toBe(4);
    expect(respawnLevel([{ xp: 60 }, { xp: 0 }, { xp: 0 }])).toBe(1);
    expect(respawnLevel([])).toBe(1);
    expect(respawnLevel([{}])).toBe(1);
  });
});
