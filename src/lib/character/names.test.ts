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
