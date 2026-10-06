import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const { getAdventureById, campaignRow, supabaseBrowserClient } = vi.hoisted(() => {
  const campaignRow: { current: Record<string, unknown> } = { current: {} };
  const supabaseBrowserClient = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: campaignRow.current, error: null }) }),
      }),
    }),
  };
  return { getAdventureById: vi.fn(), campaignRow, supabaseBrowserClient };
});

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('playerId=p1') }));
vi.mock('@/lib/supabase/client', () => ({ supabaseBrowserClient }));
vi.mock('@/lib/adventures/adventures', () => ({ getAdventureById }));

vi.mock('@/lib/supabase/campaignSettings', async () => {
  const { DEFAULT_SETTINGS } = await vi.importActual<typeof import('@/lib/campaign/settings')>('@/lib/campaign/settings');
  return {
    fetchCampaignSettings: () => Promise.resolve(DEFAULT_SETTINGS),
    saveCampaignSettings: vi.fn(),
    subscribeToCampaignSettings: () => () => {},
  };
});
vi.mock('@/lib/supabase/players', () => ({
  fetchRoundPlayers: () => Promise.resolve([]),
  saveTurnOrder: vi.fn(),
  subscribeToPlayers: () => () => {},
}));
vi.mock('@/lib/supabase/messagesRealtime', () => ({ fetchInitialMessages: vi.fn(), subscribeToNewMessages: vi.fn() }));
vi.mock('@/lib/supabase/submitAction', () => ({ submitAction: vi.fn() }));
vi.mock('@/lib/supabase/inventory', () => ({ requestEquip: vi.fn(), subscribeToInventory: () => () => {} }));
vi.mock('@/lib/supabase/economy', () => ({
  fetchPendingTrades: () => Promise.resolve([]),
  requestShop: vi.fn(),
  requestTrade: vi.fn(),
  subscribeToTrades: () => () => {},
}));
vi.mock('@/lib/supabase/roundActionsRealtime', () => ({
  subscribeToRoundActionCount: () => () => {},
  subscribeToCurrentRound: () => () => {},
  subscribeToCurrentScene: () => () => {},
  subscribeToCurrentShop: () => () => {},
  subscribeToCampaignStarted: () => () => {},
}));
vi.mock('@/lib/supabase/startCampaign', () => ({ startCampaignForClient: vi.fn() }));
vi.mock('@/lib/round/triggerRoundProcessing', () => ({ triggerRoundProcessing: vi.fn() }));

// Presentational children are stubbed: this test is about the page's adventure lookup.
vi.mock('@/components/CampaignLobby', () => ({
  CampaignLobby: ({ adventureTitle }: { adventureTitle?: string }) => <p data-testid="lobby-title">{adventureTitle ?? ''}</p>,
}));
vi.mock('@/components/MessageList', () => ({ MessageList: () => null }));
vi.mock('@/components/SceneBanner', () => ({ SceneBanner: () => null }));
vi.mock('@/components/CampaignSettingsPanel', () => ({ CampaignSettingsPanel: () => null }));

import CampaignPage from './page';

const customAdventure = {
  id: '11111111-1111-1111-1111-111111111111',
  titleTh: 'เรื่องที่ฉันแต่งเอง',
  taglineTh: 'แทกไลน์ของฉัน',
};

async function renderPage() {
  await act(async () => {
    render(<CampaignPage params={Promise.resolve({ id: 'c1' })} />);
  });
}

describe('CampaignPage — adventure title', () => {
  beforeEach(() => {
    getAdventureById.mockReset();
  });

  it('looks up a custom adventure by id and shows its title in the lobby', async () => {
    campaignRow.current = { current_round_id: null, name: 'ปาร์ตี้', join_code: 'ABC', started_at: null, adventure_id: customAdventure.id, current_scene_id: null };
    getAdventureById.mockResolvedValue(customAdventure);
    await renderPage();
    expect(getAdventureById).toHaveBeenCalledWith(supabaseBrowserClient, customAdventure.id);
    expect((await screen.findByText('เรื่องที่ฉันแต่งเอง')).getAttribute('data-testid')).toBe('lobby-title');
  });

  it('shows the custom adventure title and tagline at the table once started', async () => {
    campaignRow.current = { current_round_id: null, name: '', join_code: 'ABC', started_at: '2026-10-01T00:00:00Z', adventure_id: customAdventure.id, current_scene_id: null };
    getAdventureById.mockResolvedValue(customAdventure);
    await renderPage();
    const quest = await screen.findByLabelText('เรื่องที่เล่น');
    expect(quest.textContent).toContain('เรื่องที่ฉันแต่งเอง');
    expect(quest.textContent).toContain('แทกไลน์ของฉัน');
    // With no campaign name, the header falls back to the adventure title too.
    expect(screen.getAllByText('เรื่องที่ฉันแต่งเอง').length).toBeGreaterThanOrEqual(2);
  });

  it('does not look anything up while the campaign has no adventure id', async () => {
    campaignRow.current = { current_round_id: null, name: 'ปาร์ตี้', join_code: 'ABC', started_at: null, adventure_id: null, current_scene_id: null };
    await renderPage();
    await screen.findByTestId('lobby-title');
    expect(getAdventureById).not.toHaveBeenCalled();
    expect(screen.getByTestId('lobby-title').textContent).toBe('');
  });

  it('keeps the page working when the adventure lookup fails', async () => {
    campaignRow.current = { current_round_id: null, name: 'ปาร์ตี้', join_code: 'ABC', started_at: null, adventure_id: customAdventure.id, current_scene_id: null };
    getAdventureById.mockRejectedValue(new Error('network'));
    await renderPage();
    expect((await screen.findByTestId('lobby-title')).textContent).toBe('');
  });
});
