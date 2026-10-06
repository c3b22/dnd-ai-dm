import { describe, it, expect } from 'vitest';
import { normalizeIdentityFields, IDENTITY_FIELD_MAX } from './identity';

describe('normalizeIdentityFields', () => {
  it('trims each field', () => {
    expect(normalizeIdentityFields({ backstory: '  hi  ' })).toEqual({ backstory: 'hi' });
  });
  it('treats empty, whitespace-only and non-string values as null', () => {
    expect(normalizeIdentityFields({ backstory: '', personality: '   ', goal: 42 })).toEqual({
      backstory: null,
      personality: null,
      goal: null,
    });
  });
  it('caps each field at 500 characters', () => {
    expect(IDENTITY_FIELD_MAX).toBe(500);
    const out = normalizeIdentityFields({ goal: 'x'.repeat(900) });
    expect(out.goal).toHaveLength(500);
  });
  it('trims before capping so trailing spaces after the cap are not kept', () => {
    const out = normalizeIdentityFields({ goal: '  ' + 'a'.repeat(499) + ' b' });
    expect(out.goal).toBe('a'.repeat(499));
  });
  it('omits keys that are absent (undefined) and ignores unknown keys', () => {
    expect(normalizeIdentityFields({ goal: 'g', foo: 'bar' })).toEqual({ goal: 'g' });
    expect(normalizeIdentityFields({})).toEqual({});
  });
  it('tolerates non-object input', () => {
    expect(normalizeIdentityFields(null)).toEqual({});
    expect(normalizeIdentityFields('x')).toEqual({});
  });
});
