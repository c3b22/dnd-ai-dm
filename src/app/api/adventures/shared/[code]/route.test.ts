import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { getSharedAdventurePreview } = vi.hoisted(() => ({ getSharedAdventurePreview: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
vi.mock('@/lib/adventures/sharedAdventures', () => ({ getSharedAdventurePreview }));

import { GET } from './route';
import { CustomAdventureError } from '@/lib/adventures/customAdventures';

const call = (code = 'ABCD1234') =>
  GET(new NextRequest(`http://localhost/api/adventures/shared/${code}`), {
    params: Promise.resolve({ code }),
  });

describe('GET /api/adventures/shared/[code]', () => {
  beforeEach(() => {
    getSharedAdventurePreview.mockReset();
  });

  it('returns the preview without any auth header', async () => {
    getSharedAdventurePreview.mockResolvedValue({ title: 'T' });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: 'T' });
    expect(getSharedAdventurePreview).toHaveBeenCalledWith(expect.anything(), 'ABCD1234');
  });

  it('returns 404 for an unknown code', async () => {
    getSharedAdventurePreview.mockRejectedValue(new CustomAdventureError('shared adventure not found', 404));
    expect((await call('nope')).status).toBe(404);
  });
});
