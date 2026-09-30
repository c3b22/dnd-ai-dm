import { describe, it, expect } from 'vitest';
import { sanctuaryFor } from './sanctuaries';
import { ADVENTURES } from '@/lib/adventures/adventures';

describe('sanctuaryFor', () => {
  it('defines a sanctuary for every adventure', () => {
    for (const adventure of ADVENTURES) {
      expect(sanctuaryFor(adventure.id), adventure.id).toBeTruthy();
    }
  });

  it('returns undefined for no adventure, an unknown one, or a prototype key', () => {
    expect(sanctuaryFor(null)).toBeUndefined();
    expect(sanctuaryFor('nope')).toBeUndefined();
    expect(sanctuaryFor('constructor')).toBeUndefined();
  });
});
