import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignLobby } from './CampaignLobby';

const PLAYERS = [
  { id: 'p1', displayName: 'Prem', acted: false, isOwner: true, hp: 20, maxHp: 20, items: [], status: 'active' as const, gold: 20 },
  { id: 'p2', displayName: 'Alex', acted: false, isOwner: false, hp: 20, maxHp: 20, items: [], status: 'active' as const, gold: 20 },
];

describe('CampaignLobby', () => {
  it('shows the join code and the players who have joined so far', () => {
    render(
      <CampaignLobby
        campaignName="ค่ำคืนแรก"
        joinCode="AB12CD"
        players={PLAYERS}
        currentPlayerId="p1"
        isOwner
        onStart={vi.fn()}
      />
    );

    expect(screen.getByText('AB12CD')).toBeInTheDocument();
    expect(screen.getByText(/Prem/)).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
  });

  it('lets the owner start the game', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <CampaignLobby
        campaignName="ค่ำคืนแรก"
        joinCode="AB12CD"
        players={PLAYERS}
        currentPlayerId="p1"
        isOwner
        onStart={onStart}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /เริ่มเกม/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not show a start button to a player who is not the owner', () => {
    render(
      <CampaignLobby
        campaignName="ค่ำคืนแรก"
        joinCode="AB12CD"
        players={PLAYERS}
        currentPlayerId="p2"
        isOwner={false}
        onStart={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /เริ่มเกม/ })).not.toBeInTheDocument();
    expect(screen.getByText(/รอเจ้าของห้อง/)).toBeInTheDocument();
  });

  it('shows an error if starting fails, and lets the owner try again', async () => {
    const onStart = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <CampaignLobby
        campaignName="ค่ำคืนแรก"
        joinCode="AB12CD"
        players={PLAYERS}
        currentPlayerId="p1"
        isOwner
        onStart={onStart}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /เริ่มเกม/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /เริ่มเกม/ })).not.toBeDisabled();
  });
});
