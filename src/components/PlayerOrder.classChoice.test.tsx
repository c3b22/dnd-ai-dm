import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlayerOrder } from './PlayerOrder';
import { LEVEL_XP_THRESHOLDS } from '@/lib/character/constants';

const base = { acted: false, hp: 20, maxHp: 20, items: [], status: 'active' as const, gold: 0, classId: 'warrior', xp: LEVEL_XP_THRESHOLDS[2] };
const mine = { id: 'p1', displayName: 'Prem', isOwner: true, subclassId: null, abilityPicks: {}, ...base };
const other = { id: 'p2', displayName: 'Mila', isOwner: false, subclassId: null, abilityPicks: {}, ...base };

describe('PlayerOrder class choice (K7)', () => {
  it('shows the badge only on the current player own row and chooses through the callback', async () => {
    const onClassChoice = vi.fn().mockResolvedValue(undefined);
    render(<PlayerOrder players={[mine, other]} currentPlayerId="p1" locked={false} onMove={() => {}} onClassChoice={onClassChoice} />);
    expect(screen.getAllByRole('button', { name: /เลือกสายอาชีพ/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /เลือกสายอาชีพ/ }));
    fireEvent.click(screen.getByLabelText('ผู้พิทักษ์'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(onClassChoice).toHaveBeenCalledWith(expect.objectContaining({ kind: 'subclass' }), 'warrior_guardian'));
  });

  it('does not show the badge to other players looking at the same row', () => {
    render(<PlayerOrder players={[mine, other]} currentPlayerId="p2" locked={false} onMove={() => {}} onClassChoice={vi.fn()} />);
    // Mila (p2) is the viewer and has her own pending choice; Prem's row shows none.
    expect(screen.getAllByRole('button', { name: /เลือกสายอาชีพ/ })).toHaveLength(1);
    expect(screen.getByText(/Mila \(คุณ\)/)).toBeTruthy();
  });

  it('shows the subclass on the player card', () => {
    render(
      <PlayerOrder players={[{ ...mine, subclassId: 'warrior_berserker' }]} currentPlayerId="p1" locked={false} onMove={() => {}} onClassChoice={vi.fn()} />
    );
    expect(screen.getByText(/สายนักรบคลั่ง/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /เลือกสายอาชีพ/ })).toBeNull();
  });
});
