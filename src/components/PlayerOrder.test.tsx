import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerOrder } from './PlayerOrder';

const players = [
  { id: 'p1', displayName: 'Prem', acted: true },
  { id: 'p2', displayName: 'Mila', acted: false },
];

describe('PlayerOrder', () => {
  it('shows the acted count and asks to move a player when a button is pressed', () => {
    const onMove = vi.fn();
    render(<PlayerOrder players={players} currentPlayerId="p2" locked={false} onMove={onMove} />);

    expect(screen.getByText('1 / 2 players have acted this round')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('เลื่อน Mila ขึ้น'));
    expect(onMove).toHaveBeenCalledWith('p2', -1);
  });

  it('cannot push the first player up or the last player down', () => {
    render(<PlayerOrder players={players} currentPlayerId="p1" locked={false} onMove={() => {}} />);

    expect((screen.getByLabelText('เลื่อน Prem ขึ้น') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('เลื่อน Mila ลง') as HTMLButtonElement).disabled).toBe(true);
  });

  it('locks every button once the current player has submitted', () => {
    render(<PlayerOrder players={players} currentPlayerId="p1" locked onMove={() => {}} />);

    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});
