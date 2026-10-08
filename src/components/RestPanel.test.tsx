import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestPanel, type RestPanelProps } from './RestPanel';

const players = [
  { id: 'p1', displayName: 'อาริน', status: 'active' as const },
  { id: 'p2', displayName: 'บราน', status: 'active' as const },
  { id: 'p3', displayName: 'ซีรา', status: 'downed' as const },
];

function setup(over: Partial<RestPanelProps> = {}) {
  const props: RestPanelProps = {
    vote: null,
    players,
    currentPlayerId: 'p1',
    encounterActive: false,
    shortRestsUsed: 0,
    onPropose: vi.fn().mockResolvedValue(undefined),
    onAgree: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  render(<RestPanel {...props} />);
  return props;
}

describe('RestPanel', () => {
  it('shows both propose buttons and the short rests left', () => {
    setup({ shortRestsUsed: 1 });
    expect(screen.getByRole('button', { name: 'เสนอพักสั้น' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'เสนอพักยาว' })).toBeEnabled();
    expect(screen.getByText('พักสั้นเหลือ 1 จาก 2 ครั้ง')).toBeInTheDocument();
  });

  it('proposes short and long rests', async () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'เสนอพักสั้น' }));
    await waitFor(() => expect(props.onPropose).toHaveBeenCalledWith('short'));
    fireEvent.click(screen.getByRole('button', { name: 'เสนอพักยาว' }));
    await waitFor(() => expect(props.onPropose).toHaveBeenCalledWith('long'));
  });

  it('disables both buttons with a reason during an encounter', () => {
    setup({ encounterActive: true });
    expect(screen.getByRole('button', { name: 'เสนอพักสั้น' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'เสนอพักยาว' })).toBeDisabled();
    expect(screen.getByText('กำลังต่อสู้อยู่ พักไม่ได้')).toBeInTheDocument();
  });

  it('disables only the short rest when none are left', () => {
    setup({ shortRestsUsed: 2 });
    expect(screen.getByRole('button', { name: 'เสนอพักสั้น' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'เสนอพักยาว' })).toBeEnabled();
    expect(screen.getByText('พักสั้นเหลือ 0 จาก 2 ครั้ง')).toBeInTheDocument();
  });

  it('disables the buttons for a downed player', () => {
    setup({ currentPlayerId: 'p3' });
    expect(screen.getByRole('button', { name: 'เสนอพักยาว' })).toBeDisabled();
    expect(screen.getByText('ตัวละครของคุณพักหรือโหวตไม่ได้ในสภาพนี้')).toBeInTheDocument();
  });

  it('shows who agreed on an open vote and lets others agree', async () => {
    const props = setup({
      currentPlayerId: 'p2',
      vote: { kind: 'long', proposerId: 'p1', agree: ['p1'], roundId: 'r1', status: 'open' },
    });
    expect(screen.getByText(/โหวตพักยาว/)).toBeInTheDocument();
    expect(screen.getByText('เห็นด้วยแล้ว: อาริน')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 คน')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เสนอพักสั้น' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'เห็นด้วย' }));
    await waitFor(() => expect(props.onAgree).toHaveBeenCalled());
  });

  it('hides agree once the player agreed, and lets the proposer cancel', async () => {
    const props = setup({
      vote: { kind: 'short', proposerId: 'p1', agree: ['p1'], roundId: 'r1', status: 'open' },
    });
    expect(screen.queryByRole('button', { name: 'เห็นด้วย' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกโหวต' }));
    await waitFor(() => expect(props.onCancel).toHaveBeenCalled());
  });

  it('does not offer cancel to someone who is neither proposer nor owner', () => {
    setup({
      currentPlayerId: 'p2',
      isOwner: false,
      vote: { kind: 'short', proposerId: 'p1', agree: ['p1'], roundId: 'r1', status: 'open' },
    });
    expect(screen.queryByRole('button', { name: 'ยกเลิกโหวต' })).toBeNull();
  });

  it('shows a passed vote as waiting for the end of the round', () => {
    setup({
      vote: { kind: 'short', proposerId: 'p1', agree: ['p1', 'p2'], roundId: 'r1', status: 'passed' },
    });
    expect(screen.getByText(/โหวตผ่านแล้ว/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เห็นด้วย' })).toBeNull();
  });

  it('shows the server error message when an action fails', async () => {
    setup({ onPropose: vi.fn().mockRejectedValue(new Error('มีการโหวตพักอยู่แล้ว')) });
    fireEvent.click(screen.getByRole('button', { name: 'เสนอพักยาว' }));
    expect(await screen.findByText('มีการโหวตพักอยู่แล้ว')).toBeInTheDocument();
  });
});
