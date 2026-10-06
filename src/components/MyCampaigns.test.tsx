import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyCampaigns } from './MyCampaigns';

describe('MyCampaigns', () => {
  it('renders nothing when the player has no campaigns', () => {
    const { container } = render(<MyCampaigns campaigns={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each campaign to its game page and labels whether it has started', () => {
    render(
      <MyCampaigns
        campaigns={[
          { id: 'camp-1', playerId: 'player-1', name: 'ค่ำคืนแรก', adventureId: 'sunken-bell', started: true, isOwner: true },
          { id: 'camp-2', playerId: 'player-2', name: 'ห้องรอ', adventureId: null, started: false, isOwner: false },
        ]}
      />
    );

    const playing = screen.getByRole('link', { name: /ค่ำคืนแรก/ });
    expect(playing).toHaveAttribute('href', '/campaign/camp-1?playerId=player-1');
    expect(playing).toHaveTextContent('กำลังเล่น');

    const waiting = screen.getByRole('link', { name: /ห้องรอ/ });
    expect(waiting).toHaveAttribute('href', '/campaign/camp-2?playerId=player-2');
    expect(waiting).toHaveTextContent('ในห้องรอ');
  });
});
