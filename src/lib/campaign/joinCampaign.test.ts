import { describe, it, expect } from 'vitest';
import { joinCampaign } from './joinCampaign';
import { CLASSES } from '@/lib/character/classes';

function fakeSupabase(options: { existing: unknown | null; rejectAbilities?: boolean }) {
  const inserts: unknown[] = [];
  const kitInserts: unknown[] = [];
  const client: any = {
    from: (table: string) => table === 'inventory_items'
      ? { insert: (payload: unknown) => { kitInserts.push(payload); return Promise.resolve({ error: null }); } }
      : ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: options.existing, error: null }),
          }),
        }),
      }),
      insert: (payload: unknown) => {
        inserts.push(payload);
        if (options.rejectAbilities && 'abilities' in (payload as object)) {
          return { select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "Could not find the 'abilities' column of 'players'" } }) }) };
        }
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'new-player', ...(payload as object) }, error: null }),
          }),
        };
      },
    }),
  };
  return { client, inserts, kitInserts };
}

describe('joinCampaign', () => {
  it('creates a player when the user is not in the campaign yet', async () => {
    const { client, inserts } = fakeSupabase({ existing: null });

    const player = await joinCampaign(client, {
      campaignId: 'camp-1',
      userId: 'user-1',
      displayName: 'Prem',
    });

    expect(inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'shortsword', class_id: 'warrior', abilities: CLASSES.warrior.abilities },
    ]);
    expect(player.id).toBe('new-player');
  });

  it('gives a new player their starting kit, but not a player who already joined', async () => {
    const fresh = fakeSupabase({ existing: null });
    await joinCampaign(fresh.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'staff' });
    expect(fresh.kitInserts).toEqual([
      [
        { campaign_id: 'camp-1', player_id: 'new-player', item_id: 'staff', custom_name: '', quantity: 1, slot: 'weapon', equipped: true },
        { campaign_id: 'camp-1', player_id: 'new-player', item_id: 'potion_minor', custom_name: '', quantity: 1, slot: null, equipped: false },
      ],
    ]);

    const again = fakeSupabase({ existing: { id: 'player-9' } });
    await joinCampaign(again.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem' });
    expect(again.kitInserts).toEqual([]);
  });

  it('stores the chosen starting weapon and falls back to the default for anything else', async () => {
    const chosen = fakeSupabase({ existing: null });
    await joinCampaign(chosen.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'staff' });
    expect(chosen.inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'staff', class_id: 'cleric', abilities: CLASSES.cleric.abilities },
    ]);

    const invalid = fakeSupabase({ existing: null });
    await joinCampaign(invalid.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'lightsaber' });
    expect(invalid.inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'shortsword', class_id: 'warrior', abilities: CLASSES.warrior.abilities },
    ]);
  });

  it('stores the chosen class and its starting weapon, and seeds that weapon', async () => {
    const rogue = fakeSupabase({ existing: null });
    await joinCampaign(rogue.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', classId: 'rogue' });
    expect(rogue.inserts).toEqual([
      { campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'dagger', class_id: 'rogue', abilities: CLASSES.rogue.abilities },
    ]);
    expect((rogue.kitInserts[0] as any[])[0]).toMatchObject({ item_id: 'dagger', equipped: true });

    const wrong = fakeSupabase({ existing: null });
    await joinCampaign(wrong.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', classId: 'mage' });
    expect((wrong.inserts[0] as any).class_id).toBe('warrior');
  });

  it('maps an old client that only sends a starting weapon to its class', async () => {
    const old = fakeSupabase({ existing: null });
    await joinCampaign(old.client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem', weaponId: 'shortbow' });
    expect(old.inserts[0]).toMatchObject({ weapon_id: 'shortbow', class_id: 'archer' });
  });

  it('returns the existing player instead of inserting a duplicate when the user already joined', async () => {
    const { client, inserts } = fakeSupabase({ existing: { id: 'player-9', display_name: 'Prem' } });

    const player = await joinCampaign(client, {
      campaignId: 'camp-1',
      userId: 'user-1',
      displayName: 'Prem again',
    });

    expect(inserts).toEqual([]);
    expect(player.id).toBe('player-9');
  });

  it('retries without abilities when the column does not exist yet', async () => {
    const { client, inserts } = fakeSupabase({ existing: null, rejectAbilities: true });
    const player = await joinCampaign(client, { campaignId: 'camp-1', userId: 'user-1', displayName: 'Prem' });
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).toEqual({ campaign_id: 'camp-1', user_id: 'user-1', display_name: 'Prem', weapon_id: 'shortsword', class_id: 'warrior' });
    expect(player.id).toBe('new-player');
  });
});
