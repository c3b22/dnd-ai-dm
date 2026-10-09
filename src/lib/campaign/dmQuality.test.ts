import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDmQuality } from './dmQuality';

function fakeClient(result: () => Promise<{ data: unknown }>) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: result }) }) }),
  } as unknown as SupabaseClient;
}

describe('loadDmQuality', () => {
  it('reads fast from the room settings', async () => {
    expect(await loadDmQuality(fakeClient(async () => ({ data: { settings: { dmQuality: 'fast' } } })), 'c1')).toBe('fast');
  });
  it('defaults to good when the room has no value', async () => {
    expect(await loadDmQuality(fakeClient(async () => ({ data: { settings: {} } })), 'c1')).toBe('good');
  });
  it('defaults to good when the read fails', async () => {
    expect(await loadDmQuality(fakeClient(async () => { throw new Error('boom'); }), 'c1')).toBe('good');
  });
});
