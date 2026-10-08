import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Trades } from './Trades';
import type { RoundPlayer } from '@/lib/supabase/players';
import type { TradeRow } from '@/lib/supabase/economy';

const base = { acted: false, isOwner: false, hp: 20, maxHp: 20, status: 'active' as const };
const me: RoundPlayer = {
  ...base, id: 'p1', displayName: 'Prem', gold: 20,
  items: [{ itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true }],
};
const suki: RoundPlayer = {
  ...base, id: 'p2', displayName: 'Suki', gold: 10,
  items: [{ itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false }],
};
const trade = (over: Partial<TradeRow> = {}): TradeRow => ({
  id: 't1', fromPlayerId: 'p2', toPlayerId: 'p1', giveItems: [{ itemId: 'potion_minor', customName: '', quantity: 1 }],
  giveGold: 0, wantItems: [], wantGold: 7, createdAt: new Date().toISOString(), ...over,
});
const renderTrades = (props: Partial<React.ComponentProps<typeof Trades>> = {}) =>
  render(<Trades me={me} players={[me, suki]} trades={[]} onPropose={() => {}} onRespond={() => {}} {...props} />);

describe('Trades', () => {
  it('builds a proposal from the chosen items and gold and resets the form afterwards', () => {
    const onPropose = vi.fn();
    renderTrades({ onPropose });
    fireEvent.change(screen.getByLabelText('คู่แลก'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByLabelText('ให้: ดาบสั้น'));
    fireEvent.change(screen.getByLabelText('ทองที่ให้'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('ขอ: ยาฟื้นฟูเล็ก'));
    fireEvent.click(screen.getByRole('button', { name: 'เสนอ' }));
    expect(onPropose).toHaveBeenCalledWith({
      toPlayerId: 'p2',
      giveItems: [{ itemId: 'shortsword', customName: '', quantity: 1 }],
      giveGold: 5,
      wantItems: [{ itemId: 'potion_minor', customName: '', quantity: 1 }],
      wantGold: 0,
    });
    expect((screen.getByLabelText('ทองที่ให้') as HTMLInputElement).value).toBe('');
  });

  it('cannot propose an empty trade', () => {
    renderTrades();
    expect(screen.getByRole('button', { name: 'เสนอ' })).toBeDisabled();
  });

  it('shows an incoming proposal with accept and decline', () => {
    const onRespond = vi.fn();
    renderTrades({ trades: [trade()], onRespond });
    expect(screen.getByText(/Suki เสนอ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ตกลง' }));
    expect(onRespond).toHaveBeenCalledWith('t1', 'accept');
    fireEvent.click(screen.getByRole('button', { name: 'ปฏิเสธ' }));
    expect(onRespond).toHaveBeenCalledWith('t1', 'decline');
  });

  it('lets the proposer cancel their own proposal', () => {
    const onRespond = vi.fn();
    renderTrades({ trades: [trade({ fromPlayerId: 'p1', toPlayerId: 'p2' })], onRespond });
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(onRespond).toHaveBeenCalledWith('t1', 'cancel');
    expect(screen.queryByRole('button', { name: 'ตกลง' })).toBeNull();
  });

  it('offers no accept button on an expired incoming proposal, but still lets it be declined', () => {
    const onRespond = vi.fn();
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    renderTrades({ trades: [trade({ createdAt: old })], onRespond });
    expect(screen.getByText(/หมดอายุ/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ตกลง' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ปฏิเสธ' }));
    expect(onRespond).toHaveBeenCalledWith('t1', 'decline');
  });

  it('shows an error message', () => {
    renderTrades({ error: 'เงินไม่พอ' });
    expect(screen.getByRole('alert')).toHaveTextContent('เงินไม่พอ');
  });

  it('says so when there is nobody to trade with', () => {
    renderTrades({ players: [me] });
    expect(screen.getByText('ยังไม่มีเพื่อนให้แลกด้วย')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'เสนอ' })).toBeNull();
  });
});

describe('Trades item tooltip (O2)', () => {
  it('shows item details on hover over an offered item and still proposes the trade', () => {
    const onPropose = vi.fn();
    renderTrades({ onPropose });
    const box = screen.getByLabelText('ให้: ดาบสั้น');
    fireEvent.mouseEnter(box.closest('[data-tip-host]')!);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('ดาบสั้น');
    expect(box).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.click(box);
    fireEvent.click(screen.getByLabelText('ขอ: ยาฟื้นฟูเล็ก'));
    fireEvent.click(screen.getByRole('button', { name: 'เสนอ' }));
    expect(onPropose).toHaveBeenCalledTimes(1);
    expect(onPropose.mock.calls[0][0]).toMatchObject({ toPlayerId: 'p2', giveGold: 0, wantGold: 0 });
  });
});
