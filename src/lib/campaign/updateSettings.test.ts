import { describe, it, expect } from 'vitest';
import { SettingsError, updateCampaignSettings } from './updateSettings';
import { DEFAULT_SETTINGS } from './settings';

function fakeSupabase(stored: unknown = {}) {
  const updates: unknown[] = [];
  const client: any = {
    from: (table: string) => {
      if (table === 'players') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  { id: 'p2', user_id: 'u2', created_at: '2026-01-02' },
                  { id: 'p1', user_id: 'u1', created_at: '2026-01-01' },
                ],
                error: null,
              }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { settings: stored }, error: null }) }) }),
        update: (values: unknown) => ({
          eq: () => {
            updates.push(values);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
  return { client, updates };
}

describe('updateCampaignSettings', () => {
  it('merges the owner\'s change into the stored settings', async () => {
    const { client, updates } = fakeSupabase({ difficulty: 'hard' });

    const result = await updateCampaignSettings(client, {
      campaignId: 'c',
      userId: 'u1',
      patch: { roundSeconds: 60 },
    });

    expect(result).toEqual({ ...DEFAULT_SETTINGS, difficulty: 'hard', roundSeconds: 60 });
    expect(updates).toEqual([{ settings: result }]);
  });

  it('refuses anyone who is not the owner', async () => {
    const { client, updates } = fakeSupabase();

    await expect(
      updateCampaignSettings(client, { campaignId: 'c', userId: 'u2', patch: { diceEnabled: false } })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateCampaignSettings(client, { campaignId: 'c', userId: 'stranger', patch: { diceEnabled: false } })
    ).rejects.toBeInstanceOf(SettingsError);
    expect(updates).toHaveLength(0);
  });
});
