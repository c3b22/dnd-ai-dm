import { describe, it, expect } from 'vitest';
import { extractShareCode } from './extractShareCode';

describe('extractShareCode', () => {
  it('accepts a bare code and uppercases it', () => {
    expect(extractShareCode('ab23cdef')).toBe('AB23CDEF');
    expect(extractShareCode('  AB23CDEF  ')).toBe('AB23CDEF');
  });

  it('takes the last path segment of a full link', () => {
    expect(extractShareCode('http://localhost:3000/adventures/shared/AB23CDEF')).toBe('AB23CDEF');
    expect(extractShareCode('https://example.com/adventures/shared/AB23CDEF/')).toBe('AB23CDEF');
  });

  it('ignores query string and hash', () => {
    expect(extractShareCode('https://x.com/adventures/shared/AB23CDEF?ref=1#top')).toBe('AB23CDEF');
  });

  it('accepts a link without protocol', () => {
    expect(extractShareCode('x.com/adventures/shared/ab23cdef')).toBe('AB23CDEF');
  });

  it('returns null for empty input', () => {
    expect(extractShareCode('')).toBeNull();
    expect(extractShareCode('   ')).toBeNull();
    expect(extractShareCode('https://x.com/')).toBeNull();
  });

  it('returns null when the tail is not a plausible code', () => {
    expect(extractShareCode('ab cd')).toBeNull();
    expect(extractShareCode('ab$cd')).toBeNull();
  });
});
