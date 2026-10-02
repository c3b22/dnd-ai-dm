import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inventory } from './Inventory';
import type { InventoryItem } from '@/lib/inventory/types';

const sword: InventoryItem = { itemId: 'shortsword', customName: '', quantity: 1, slot: 'weapon', equipped: true };
const bow: InventoryItem = { itemId: 'shortbow', customName: '', quantity: 1, slot: 'weapon', equipped: false };
const potion: InventoryItem = { itemId: 'potion_minor', customName: '', quantity: 2, slot: null, equipped: false };
const key: InventoryItem = { itemId: 'story', customName: 'Rusty Key', quantity: 1, slot: null, equipped: false };

describe('Inventory', () => {
  it('shows the weight and every item with its quantity and worn state', () => {
    render(<Inventory items={[sword, bow, potion, key]} gold={12} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('น้ำหนัก 6/10')).toBeInTheDocument(); // 2 + 2 + 2 potions + 0 for the story key
    expect(screen.getByText(/ยาฟื้นฟูเล็ก ×2/)).toBeInTheDocument();
    expect(screen.getByText('สวมอยู่')).toBeInTheDocument();
  });

  it('shows the gold', () => {
    render(<Inventory items={[]} gold={12} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('ทอง 12')).toBeInTheDocument();
  });

  it('says the pack is empty', () => {
    render(<Inventory items={[]} gold={12} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('กระเป๋าว่าง')).toBeInTheDocument();
  });

  it('equips a spare weapon and unequips the worn one', () => {
    const onEquip = vi.fn();
    render(<Inventory items={[sword, bow]} gold={12} canAct onEquip={onEquip} onDrink={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'สวม ธนูสั้น' }));
    expect(onEquip).toHaveBeenCalledWith('shortbow', 'equip');
    fireEvent.click(screen.getByRole('button', { name: 'ถอด ดาบสั้น' }));
    expect(onEquip).toHaveBeenCalledWith('shortsword', 'unequip');
  });

  it('drinks a potion, and locks drinking (but not equipping) when the player cannot act', () => {
    const onDrink = vi.fn();
    const { rerender } = render(<Inventory items={[potion]} gold={12} canAct onEquip={() => {}} onDrink={onDrink} />);
    fireEvent.click(screen.getByRole('button', { name: 'ดื่ม ยาฟื้นฟูเล็ก' }));
    expect(onDrink).toHaveBeenCalledWith('potion_minor');

    rerender(<Inventory items={[potion, bow]} gold={12} canAct={false} onEquip={() => {}} onDrink={onDrink} />);
    expect(screen.getByRole('button', { name: 'ดื่ม ยาฟื้นฟูเล็ก' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'สวม ธนูสั้น' })).toBeEnabled();
  });

  it('locks drinking at full HP so the potion is not wasted, but still allows equipping', () => {
    render(<Inventory items={[potion, bow]} gold={12} canAct fullHp onEquip={() => {}} onDrink={() => {}} />);
    const drinkButton = screen.getByRole('button', { name: 'ดื่ม ยาฟื้นฟูเล็ก' });
    expect(drinkButton).toBeDisabled();
    expect(drinkButton.title).toBe('เลือดเต็มแล้ว');
    expect(screen.getByRole('button', { name: 'สวม ธนูสั้น' })).toBeEnabled();
  });

  it('gives story items no buttons', () => {
    render(<Inventory items={[key]} gold={12} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(screen.getByText('Rusty Key')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lists items in a stable order (weapons, armor, potions, story) whatever order the database returns', () => {
    const armor: InventoryItem = { itemId: 'armor_light', customName: '', quantity: 1, slot: 'armor', equipped: true };
    render(<Inventory items={[key, potion, armor, bow, sword]} gold={12} canAct onEquip={() => {}} onDrink={() => {}} />);
    const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names.map((n) => n.replace(/(สวมอยู่|สวม|ถอด|ดื่ม).*/, '').trim())).toEqual([
      'ดาบสั้น', 'ธนูสั้น', 'เกราะหนัง', 'ยาฟื้นฟูเล็ก ×2', 'Rusty Key',
    ]);
  });
});
