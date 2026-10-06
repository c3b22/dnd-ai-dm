import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyCampaigns } from './MyCampaigns';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  supabaseBrowserClient: { auth: { getSession } },
}));

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn();
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'token-123' } } });
});
afterEach(() => { global.fetch = originalFetch; });

const owned = { id: 'camp-1', playerId: 'player-1', name: 'ค่ำคืนแรก', adventureId: 'sunken-bell', started: true, isOwner: true };
const joined = { id: 'camp-2', playerId: 'player-2', name: 'ห้องรอ', adventureId: null, started: false, isOwner: false };

describe('MyCampaigns', () => {
  it('renders nothing when the player has no campaigns', () => {
    const { container } = render(<MyCampaigns campaigns={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each campaign to its game page and labels whether it has started', () => {
    render(<MyCampaigns campaigns={[owned, joined]} />);

    const playing = screen.getByRole('link', { name: /ค่ำคืนแรก/ });
    expect(playing).toHaveAttribute('href', '/campaign/camp-1?playerId=player-1');
    expect(playing).toHaveTextContent('กำลังเล่น');

    const waiting = screen.getByRole('link', { name: /ห้องรอ/ });
    expect(waiting).toHaveAttribute('href', '/campaign/camp-2?playerId=player-2');
    expect(waiting).toHaveTextContent('ในห้องรอ');
  });

  it('offers "ลบห้อง" to the owner and "ออกจากห้อง" to other players, outside the link', () => {
    render(<MyCampaigns campaigns={[owned, joined]} />);
    const del = screen.getByRole('button', { name: 'ลบห้อง' });
    const leave = screen.getByRole('button', { name: 'ออกจากห้อง' });
    expect(del.closest('a')).toBeNull();
    expect(leave.closest('a')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('asks for confirmation (permanent, everyone loses the room) and does not call the API until confirmed', () => {
    render(<MyCampaigns campaigns={[owned]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบห้อง' }));
    expect(screen.getByText(/ลบห้องนี้ถาวร/)).toBeTruthy();
    expect(screen.getByText(/ผู้เล่นทุกคน/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(screen.queryByText(/ลบห้องนี้ถาวร/)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('deletes the room via DELETE /api/campaigns/[id] with the token and removes the row', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<MyCampaigns campaigns={[owned, joined]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบห้อง' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันลบห้อง' }));
    await waitFor(() => expect(screen.queryByText('ค่ำคืนแรก')).toBeNull());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/campaigns/camp-1',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer token-123' }) })
    );
    expect(screen.getByText('ห้องรอ')).toBeTruthy();
  });

  it('leaves the room via POST /api/campaigns/[id]/leave and removes the row', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<MyCampaigns campaigns={[owned, joined]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากห้อง' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันออกจากห้อง' }));
    await waitFor(() => expect(screen.queryByText('ห้องรอ')).toBeNull());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/campaigns/camp-2/leave',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token-123' }) })
    );
    expect(screen.getByText('ค่ำคืนแรก')).toBeTruthy();
  });

  it('keeps the row and shows an error message when the API fails', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'round in progress' }) });
    render(<MyCampaigns campaigns={[owned]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบห้อง' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันลบห้อง' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('ค่ำคืนแรก')).toBeTruthy();
  });

  it('keeps the row and shows an error message when the request itself throws', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('network'));
    render(<MyCampaigns campaigns={[joined]} />);
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากห้อง' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันออกจากห้อง' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('ห้องรอ')).toBeTruthy();
  });
});
