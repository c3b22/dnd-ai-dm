import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { createCampaign, joinCampaign } = vi.hoisted(() => ({ createCampaign: vi.fn(), joinCampaign: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));
vi.mock('@/lib/adventures/adventures', () => ({ getAdventureById: vi.fn() }));
vi.mock('@/lib/campaign/createCampaign', () => ({ createCampaign }));
vi.mock('@/lib/campaign/joinCampaign', () => ({ joinCampaign }));

import { POST as createRoute } from './route';
import { POST as joinRoute } from './[id]/join/route';

describe('identity fields through the routes', () => {
  beforeEach(() => {
    createCampaign.mockReset().mockResolvedValue({ campaign: { id: 'c' } });
    joinCampaign.mockReset().mockResolvedValue({ id: 'p' });
  });

  it('create route passes normalized identity fields to createCampaign', async () => {
    const res = await createRoute(new NextRequest('http://localhost/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name: 'T', userId: 'u', displayName: 'P', backstory: '  hi  ', personality: 42, goal: 'z'.repeat(700) }),
    }));
    expect(res.status).toBe(201);
    const params = createCampaign.mock.calls[0][1];
    expect(params.backstory).toBe('hi');
    expect(params.personality).toBeNull();
    expect(params.goal).toHaveLength(500);
  });

  it('join route passes normalized identity fields to joinCampaign', async () => {
    const res = await joinRoute(
      new NextRequest('http://localhost/api/campaigns/c1/join', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u', displayName: 'P', goal: '  find sister ' }),
      }),
      { params: Promise.resolve({ id: 'c1' }) }
    );
    expect(res.status).toBe(201);
    const params = joinCampaign.mock.calls[0][1];
    expect(params.goal).toBe('find sister');
    expect(params).not.toHaveProperty('backstory');
  });
});
