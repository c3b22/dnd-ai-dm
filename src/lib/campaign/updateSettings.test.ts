import { describe, it, expect } from 'vitest';
import { SettingsError, updateCampaignSettings } from './updateSettings';
import { DEFAULT_SETTINGS } from './settings';

function fakeSupabase(stored: unknown = {}, startedAt: string | null = null) {
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
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { settings: stored, started_at: startedAt }, error: null }) }) }),
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

  it('saves dmQuality, and old rooms without it read as good', async () => {
    const { client, updates } = fakeSupabase({ difficulty: 'hard' });
    const result = await updateCampaignSettings(client, { campaignId: 'c', userId: 'u1', patch: { dmQuality: 'fast' } });
    expect(result.dmQuality).toBe('fast');
    expect(updates).toEqual([{ settings: result }]);
    const other = await updateCampaignSettings(fakeSupabase({}).client, { campaignId: 'c', userId: 'u1', patch: { roundSeconds: 60 } });
    expect(other.dmQuality).toBe('good');
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

  it('lets the owner turn permadeath on before the game starts', async () => {
    const { client } = fakeSupabase({}, null);
    const result = await updateCampaignSettings(client, { campaignId: 'c', userId: 'u1', patch: { permadeath: true } });
    expect(result.permadeath).toBe(true);
  });

  it('refuses to change permadeath once the game has started', async () => {
    const { client, updates } = fakeSupabase({ permadeath: false }, '2026-01-03');
    await expect(
      updateCampaignSettings(client, { campaignId: 'c', userId: 'u1', patch: { permadeath: true } })
    ).rejects.toMatchObject({ status: 409 });
    expect(updates).toHaveLength(0);
  });

  it('still saves other settings after start, and tolerates an unchanged permadeath', async () => {
    const { client } = fakeSupabase({ permadeath: true }, '2026-01-03');
    const result = await updateCampaignSettings(client, {
      campaignId: 'c',
      userId: 'u1',
      patch: { permadeath: true, roundSeconds: 60 },
    });
    expect(result).toMatchObject({ permadeath: true, roundSeconds: 60 });
  });
});
