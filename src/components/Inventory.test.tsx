import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inventory } from './Inventory';
import type { InventoryItem } from '@/lib/inventory/types';
import { MAGIC_ITEMS } from '@/lib/inventory/magicItems';

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

describe('Inventory magic items (F5h)', () => {
  const find = (kind: string, rarity: string) => MAGIC_ITEMS.find((i) => i.mechanic.kind === kind && i.rarity === rarity)!;
  const row = (id: string, equipped = false): InventoryItem => ({ itemId: id, customName: '', quantity: 1, slot: null, equipped });
  const renderOne = (id: string) =>
    render(<Inventory items={[row(id)]} gold={0} canAct onEquip={() => {}} onDrink={() => {}} />);

  it('shows rarity badge and weapon damage bonus', () => {
    const w = find('weapon', 'rare');
    renderOne(w.id);
    expect(screen.getByText('หายาก')).toBeInTheDocument();
    expect(screen.getByText(`ดาเมจ +${(w.mechanic as { damageBonus: number }).damageBonus}`)).toBeInTheDocument();
    expect(screen.getByText(w.flavorTh)).toBeInTheDocument();
  });

  it('shows armor reduction, potion healing, scroll pips and accessory skill bonus', () => {
    const a = find('armor', 'uncommon');
    const { unmount } = renderOne(a.id);
    expect(screen.getByText('ไม่ธรรมดา')).toBeInTheDocument();
    expect(screen.getByText(/ลดดาเมจที่ได้รับ/)).toBeInTheDocument();
    unmount();

    const p = find('consumable', 'uncommon');
    const u2 = renderOne(p.id);
    expect(screen.getByText(/ฟื้นฟู .* HP/)).toBeInTheDocument();
    u2.unmount();

    const s = find('scroll', 'uncommon');
    const u3 = renderOne(s.id);
    expect(screen.getByText(/ศัตรูเสีย \d+ pip/)).toBeInTheDocument();
    u3.unmount();

    const acc = find('accessory', 'uncommon');
    renderOne(acc.id);
    expect(screen.getByText(/โบนัสทักษะ .* \+\d/)).toBeInTheDocument();
  });

  it('shows the legendary badge', () => {
    const l = MAGIC_ITEMS.find((i) => i.rarity === 'legendary' && ['weapon', 'armor', 'accessory'].includes(i.mechanic.kind))!;
    renderOne(l.id);
    expect(screen.getByText('ตำนาน')).toBeInTheDocument();
  });

  it('plain items show no rarity badge or effect line', () => {
    const { container } = render(<Inventory items={[sword, potion]} gold={0} canAct onEquip={() => {}} onDrink={() => {}} />);
    expect(container.querySelector('.badge-rarity')).toBeNull();
    expect(container.querySelector('.inv-effect')).toBeNull();
  });
});

describe('Inventory special mechanics (F5j10)', () => {
  const worn = (id: string): InventoryItem => {
    const m = MAGIC_ITEMS.find((i) => i.id === id)!;
    return { itemId: id, customName: '', quantity: 1, slot: m.mechanic.kind as 'weapon' | 'armor' | 'accessory', equipped: true };
  };
  const view = (items: InventoryItem[]) =>
    render(<Inventory items={items} gold={0} canAct onEquip={() => {}} onDrink={() => {}} />);

  it('describes each special effect and shows the theme badge', () => {
    const fx = MAGIC_ITEMS.find((i) => i.effect === 'crit_surge')!;
    const { container } = view([{ ...worn(fx.id) }]);
    expect(container.querySelector('.inv-special')?.textContent).toMatch(/วิกฤตทวี/);
    if (fx.theme) expect(screen.getByText(`ธีม${fx.theme}`)).toBeInTheDocument();
  });

  it('shows the effect value when the item has one', () => {
    const fx = MAGIC_ITEMS.find((i) => i.effect === 'ward' && i.effectValue === 3)!;
    const { container } = view([worn(fx.id)]);
    expect(container.querySelector('.inv-special')?.textContent).toContain('เพิ่ม 3');
  });

  it('says a full set is complete', () => {
    view([worn('dagger_shadowsnake'), worn('armor_shadowhide'), worn('acc_silentshawl')]);
    expect(screen.getAllByText('ครบชุดธีมเงา +1 ทุกการเช็ก').length).toBe(3);
  });

  it('lists the missing slots of a partial set', () => {
    view([worn('dagger_shadowsnake'), worn('armor_shadowhide')]);
    expect(screen.getAllByText('ธีมเงา 2/3 ขาด: เครื่องประดับ').length).toBe(2);
  });

  it('shows no set status for unworn themed items, and nothing extra for plain items', () => {
    const spare = { ...worn('dagger_shadowsnake'), equipped: false };
    const { container } = view([spare, sword]);
    expect(container.querySelector('.inv-set')).toBeNull();
    expect(screen.getByText('ธีมเงา')).toBeInTheDocument();
  });
});

describe('Inventory scrolls (M1)', () => {
  const scrollItem: InventoryItem = { itemId: 'scroll_spark', customName: '', quantity: 1, slot: null, equipped: false };
  const wolves = ['หมาป่า', 'เจ้าป่า'];

  it('hides the scroll button when there is no encounter', () => {
    const { rerender } = render(<Inventory items={[scrollItem]} gold={0} canAct onEquip={() => {}} onDrink={() => {}} onUseScroll={() => {}} />);
    expect(screen.queryByRole('button', { name: /ใช้ม้วน/ })).toBeNull();
    rerender(<Inventory items={[scrollItem]} gold={0} canAct enemies={[]} onEquip={() => {}} onDrink={() => {}} onUseScroll={() => {}} />);
    expect(screen.queryByRole('button', { name: /ใช้ม้วน/ })).toBeNull();
  });

  it('reads the scroll at the first enemy by default', () => {
    const onUseScroll = vi.fn();
    render(<Inventory items={[scrollItem]} gold={0} canAct enemies={wolves} onEquip={() => {}} onDrink={() => {}} onUseScroll={onUseScroll} />);
    fireEvent.click(screen.getByRole('button', { name: /ใช้ม้วน/ }));
    expect(onUseScroll).toHaveBeenCalledWith('scroll_spark', 'หมาป่า');
  });

  it('reads the scroll at the chosen enemy', () => {
    const onUseScroll = vi.fn();
    render(<Inventory items={[scrollItem]} gold={0} canAct enemies={wolves} onEquip={() => {}} onDrink={() => {}} onUseScroll={onUseScroll} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'เจ้าป่า' } });
    fireEvent.click(screen.getByRole('button', { name: /ใช้ม้วน/ }));
    expect(onUseScroll).toHaveBeenCalledWith('scroll_spark', 'เจ้าป่า');
  });

  it('disables the scroll button when the player cannot act', () => {
    render(<Inventory items={[scrollItem]} gold={0} canAct={false} enemies={wolves} onEquip={() => {}} onDrink={() => {}} onUseScroll={() => {}} />);
    expect(screen.getByRole('button', { name: /ใช้ม้วน/ })).toBeDisabled();
  });
});

describe('Inventory item tooltip (O1)', () => {
  const armor: InventoryItem = { itemId: 'armor_medium', customName: '', quantity: 1, slot: 'armor', equipped: false };
  const magicSword = MAGIC_ITEMS.find((i) => i.mechanic.kind === 'weapon' && i.theme)!;
  const magicRow: InventoryItem = { itemId: magicSword.id, customName: '', quantity: 1, slot: 'weapon', equipped: true };
  const setup = (items: InventoryItem[]) =>
    render(<Inventory items={items} gold={0} canAct onEquip={() => {}} onDrink={() => {}} />);
  const row = (name: RegExp) => screen.getByText(name).closest('li')!;

  it('shows dice and weight when a plain weapon row is hovered, and hides on leave', () => {
    setup([bow]);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const li = row(/ธนูสั้น/);
    fireEvent.mouseEnter(li);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('1d6');
    expect(tip).toHaveTextContent('น้ำหนัก 2');
    expect(li).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.mouseLeave(li);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the same on keyboard focus, and the row is focusable', () => {
    setup([bow]);
    const li = row(/ธนูสั้น/);
    expect(li).toHaveAttribute('tabindex', '0');
    fireEvent.focus(li);
    expect(screen.getByRole('tooltip')).toHaveTextContent('1d6');
  });

  it('shows armor reduction and potion heal', () => {
    setup([armor, potion]);
    fireEvent.mouseEnter(row(/เกราะโซ่/));
    expect(screen.getByRole('tooltip')).toHaveTextContent('ลดดาเมจที่ได้รับ 2');
    fireEvent.mouseEnter(row(/ยาฟื้นฟูเล็ก/));
    expect(screen.getByRole('tooltip')).toHaveTextContent('ฟื้นฟู 1d6+1 HP');
  });

  it('shows rarity, mechanic and set status for a magic item', () => {
    setup([magicRow]);
    fireEvent.mouseEnter(row(new RegExp(magicSword.nameTh)));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(`ธีม${magicSword.theme}`);
    expect(tip).toHaveTextContent(/ดาเมจ \+\d/);
    expect(tip).toHaveTextContent(/ขาด:/);
  });

  it('shows no invented numbers for a story item', () => {
    setup([key]);
    fireEvent.mouseEnter(row(/Rusty Key/));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Rusty Key');
    expect(tip.textContent).not.toMatch(/\d/);
  });

  it('closes on Escape', () => {
    setup([bow]);
    const li = row(/ธนูสั้น/);
    fireEvent.focus(li);
    fireEvent.keyDown(li, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens only one tooltip at a time', () => {
    setup([sword, bow]);
    fireEvent.mouseEnter(row(/ดาบสั้น/));
    fireEvent.mouseEnter(row(/ธนูสั้น/));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('ธนูสั้น');
  });

  it('toggles on tap of the name without firing equip', () => {
    const onEquip = vi.fn();
    render(<Inventory items={[bow]} gold={0} canAct onEquip={onEquip} onDrink={() => {}} />);
    const name = document.querySelector('.inv-name')!;
    fireEvent.click(name);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.click(name);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(onEquip).not.toHaveBeenCalled();
  });
});
