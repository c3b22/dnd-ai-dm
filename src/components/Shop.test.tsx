import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Shop } from './Shop';
import type { InventoryItem } from '@/lib/inventory/types';

const shop = { name: 'Old Mara', itemIds: ['potion_minor', 'shortsword', 'armor_heavy'] };
const potion: InventoryItem = { itemId: 'potion_minor', customName: '', quantity: 1, slot: null, equipped: false };
const key: InventoryItem = { itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false };

describe('Shop', () => {
  it('shows the merchant and each ware with its price', () => {
    render(<Shop shop={shop} items={[]} gold={50} onBuy={() => {}} onSell={() => {}} />);
    expect(screen.getByText('Old Mara')).toBeInTheDocument();
    expect(screen.getByText(/ยาฟื้นฟูเล็ก/)).toBeInTheDocument();
    expect(screen.getByText(/10 ทอง/)).toBeInTheDocument();
    expect(screen.getByText(/90 ทอง/)).toBeInTheDocument();
  });

  it('buys, and disables buying what the player cannot afford or carry', () => {
    const onBuy = vi.fn();
    const { rerender } = render(<Shop shop={shop} items={[]} gold={35} onBuy={onBuy} onSell={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'ซื้อ ดาบสั้น' }));
    expect(onBuy).toHaveBeenCalledWith('shortsword');
    expect(screen.getByRole('button', { name: 'ซื้อ เกราะเหล็ก' })).toBeDisabled(); // 90 > 35

    const packed: InventoryItem = { ...potion, quantity: 9 };
    rerender(<Shop shop={shop} items={[packed]} gold={500} onBuy={onBuy} onSell={() => {}} />);
    expect(screen.getByRole('button', { name: 'ซื้อ ดาบสั้น' })).toBeDisabled(); // 9 + 2 > 10
  });

  it('sells sellable items at half price and offers nothing for story items', () => {
    const onSell = vi.fn();
    render(<Shop shop={shop} items={[potion, key]} gold={0} onBuy={() => {}} onSell={onSell} />);
    fireEvent.click(screen.getByRole('button', { name: 'ขาย ยาฟื้นฟูเล็ก' }));
    expect(onSell).toHaveBeenCalledWith('potion_minor', '');
    expect(screen.getByText(/5 ทอง/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ขาย Rusty Key' })).toBeNull();
  });

  it('shows its own error message next to the shop, not somewhere else', () => {
    render(<Shop shop={shop} items={[]} gold={50} onBuy={() => {}} onSell={() => {}} error="เงินไม่พอ" />);
    expect(screen.getByRole('alert')).toHaveTextContent('เงินไม่พอ');
  });
});

describe('Shop item tooltip (O2)', () => {
  it('shows price and stats for a ware on hover, and buying still works with the tooltip open', () => {
    const onBuy = vi.fn();
    render(<Shop shop={shop} items={[]} gold={50} onBuy={onBuy} onSell={() => {}} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const row = screen.getByText(/ดาบสั้น/).closest('li')!;
    fireEvent.mouseEnter(row);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('ดาบสั้น');
    expect(tip).toHaveTextContent('ราคาซื้อ');
    expect(row).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.click(screen.getByRole('button', { name: 'ซื้อ ดาบสั้น' }));
    expect(onBuy).toHaveBeenCalledWith('shortsword');
    fireEvent.mouseLeave(row);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows a tooltip for items you sell, and selling still works', () => {
    const onSell = vi.fn();
    render(<Shop shop={shop} items={[potion]} gold={0} onBuy={() => {}} onSell={onSell} />);
    const row = screen.getAllByText(/ยาฟื้นฟูเล็ก/).map((e) => e.closest('li')!).pop()!;
    fireEvent.focus(row);
    expect(screen.getByRole('tooltip')).toHaveTextContent('ขายคืน');
    fireEvent.click(screen.getByRole('button', { name: 'ขาย ยาฟื้นฟูเล็ก' }));
    expect(onSell).toHaveBeenCalledWith('potion_minor', '');
  });
});
