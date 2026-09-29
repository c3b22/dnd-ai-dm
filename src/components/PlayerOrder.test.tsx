import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerOrder } from './PlayerOrder';

const players = [
  { id: 'p1', displayName: 'Prem', acted: true, isOwner: true },
  { id: 'p2', displayName: 'Mila', acted: false, isOwner: false },
  { id: 'p3', displayName: 'Tan', acted: false, isOwner: false },
];

describe('PlayerOrder', () => {
  it('shows the acted count and asks to move a player when a button is pressed', () => {
    const onMove = vi.fn();
    render(<PlayerOrder players={players} currentPlayerId="p2" locked={false} onMove={onMove} />);

    expect(screen.getByText('1 / 3 players have acted this round')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('เลื่อน Mila ขึ้น'));
    expect(onMove).toHaveBeenCalledWith('p2', -1);
  });

  it('cannot push the first player up or the last player down', () => {
    render(<PlayerOrder players={players} currentPlayerId="p1" locked={false} onMove={() => {}} />);

    expect((screen.getByLabelText('เลื่อน Prem ขึ้น') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('เลื่อน Tan ลง') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets the owner move everyone but a regular player only themselves', () => {
    const { rerender } = render(
      <PlayerOrder players={players} currentPlayerId="p1" locked={false} onMove={() => {}} />
    );
    expect((screen.getByLabelText('เลื่อน Mila ลง') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/เจ้าของโต๊ะ/)).toBeTruthy();

    rerender(<PlayerOrder players={players} currentPlayerId="p2" locked={false} onMove={() => {}} />);
    expect((screen.getByLabelText('เลื่อน Mila ลง') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('เลื่อน Tan ขึ้น') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/เฉพาะลำดับของตัวเอง/)).toBeTruthy();
  });

  it('locks every button once the current player has submitted', () => {
    render(<PlayerOrder players={players} currentPlayerId="p1" locked onMove={() => {}} />);

    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('reports a drag and drop from one row onto another', () => {
    const onReorder = vi.fn();
    render(
      <PlayerOrder players={players} currentPlayerId="p1" locked={false} onMove={() => {}} onReorder={onReorder} />
    );
    const rows = screen.getAllByRole('listitem');

    fireEvent.dragStart(rows[2]);
    fireEvent.dragOver(rows[0]);
    fireEvent.drop(rows[0]);

    expect(onReorder).toHaveBeenCalledWith('p3', 'p1');
  });

  it('does not make other rows draggable for a regular player', () => {
    render(
      <PlayerOrder players={players} currentPlayerId="p2" locked={false} onMove={() => {}} onReorder={() => {}} />
    );
    const rows = screen.getAllByRole('listitem');

    expect(rows[1].getAttribute('draggable')).toBe('true');
    expect(rows[2].getAttribute('draggable')).toBe('false');
  });
});
