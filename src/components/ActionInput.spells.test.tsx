import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionInput, type SpellMenu } from './ActionInput';

// K4: the mage's "ร่ายเวท" menu.
const menu = (over: Partial<SpellMenu> = {}): SpellMenu => ({
  slotsLeft: 2,
  slotsMax: 3,
  list: [
    { id: 'arcane_bolt', nameTh: 'แสงเวทพุ่ง', descTh: 'ยิงลูกแสง', slots: 0, target: 'enemy' },
    { id: 'fire_burst', nameTh: 'ลูกไฟระเบิด', descTh: 'ลูกไฟ', slots: 1, target: 'enemies' },
    { id: 'arcane_shield', nameTh: 'โล่เวท', descTh: 'โล่', slots: 1, target: 'ally_or_self' },
    { id: 'quicken_rhythm', nameTh: 'เร่งจังหวะ', descTh: 'เร่ง', slots: 1, target: 'ally' },
    { id: 'arcane_sight', nameTh: 'ตาเวท', descTh: 'ตา', slots: 0, target: 'self' },
  ],
  enemies: ['หมาป่า', 'หมาป่า 2'],
  allies: [
    { id: 'm1', name: 'Mira', isSelf: true },
    { id: 'p2', name: 'Nok', isSelf: false },
  ],
  surge: { nameTh: 'เวทไหลล้น', cooldown: 0 },
  ...over,
});

function setup(spells: SpellMenu = menu(), extra: object = {}) {
  const onCastSpell = vi.fn().mockResolvedValue(undefined);
  render(<ActionInput onSubmit={vi.fn()} spells={spells} onCastSpell={onCastSpell} {...extra} />);
  return { onCastSpell };
}
const open = () => userEvent.click(screen.getByRole('button', { name: 'ร่ายเวท' }));

describe('ActionInput spell menu (K4)', () => {
  it('shows the remaining slots and nothing else until the menu is opened', () => {
    setup();
    expect(screen.getByText('ช่องเวทเหลือ 2/3')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'เลือกเวท' })).toBeNull();
  });

  it('is absent for a player without spells', () => {
    render(<ActionInput onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'ร่ายเวท' })).toBeNull();
  });

  it('lists the spells with their cost', async () => {
    setup();
    await open();
    expect(screen.getByRole('button', { name: /แสงเวทพุ่ง · ฟรี/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /ลูกไฟระเบิด · 1 ช่อง/ })).toBeEnabled();
  });

  it('casts a spell that needs no target straight away', async () => {
    const { onCastSpell } = setup();
    await open();
    await userEvent.click(screen.getByRole('button', { name: /ลูกไฟระเบิด/ }));
    expect(onCastSpell).toHaveBeenCalledWith('fire_burst', {}, false);
    expect(await screen.findByText(/ส่ง action แล้ว/)).toBeInTheDocument();
  });

  it('an enemy spell asks which enemy, then casts at it', async () => {
    const { onCastSpell } = setup();
    await open();
    await userEvent.click(screen.getByRole('button', { name: /แสงเวทพุ่ง/ }));
    expect(onCastSpell).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'หมาป่า 2' }));
    expect(onCastSpell).toHaveBeenCalledWith('arcane_bolt', { enemy: 'หมาป่า 2' }, false);
  });

  it('a friend spell offers everyone including yourself; a friend-only spell leaves you out', async () => {
    const { onCastSpell } = setup();
    await open();
    await userEvent.click(screen.getByRole('button', { name: /โล่เวท/ }));
    expect(screen.getByRole('button', { name: 'Mira (ตัวเอง)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nok' }));
    expect(onCastSpell).toHaveBeenCalledWith('arcane_shield', { allyId: 'p2' }, false);
  });

  it('a friend-only spell does not offer the caster', async () => {
    setup();
    await open();
    await userEvent.click(screen.getByRole('button', { name: /เร่งจังหวะ/ }));
    expect(screen.queryByRole('button', { name: /ตัวเอง/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nok' })).toBeInTheDocument();
  });

  it('the choice can be undone before casting', async () => {
    setup();
    await open();
    await userEvent.click(screen.getByRole('button', { name: /แสงเวทพุ่ง/ }));
    await userEvent.click(screen.getByRole('button', { name: 'เลือกเวทใหม่' }));
    expect(screen.getByRole('group', { name: 'เลือกเวท' })).toBeInTheDocument();
  });

  it('disables slot spells when no slot is left, but cantrips stay castable', async () => {
    setup(menu({ slotsLeft: 0 }));
    await open();
    expect(screen.getByRole('button', { name: /ลูกไฟระเบิด · 1 ช่อง \(ช่องเวทหมด\)/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /แสงเวทพุ่ง · ฟรี/ })).toBeEnabled();
  });

  it('turns enemy spells off when there is no fight', async () => {
    setup(menu({ enemies: [] }));
    await open();
    expect(screen.getByRole('button', { name: /แสงเวทพุ่ง · ฟรี \(ไม่มีศัตรู\)/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /ลูกไฟระเบิด/ })).toBeEnabled();
  });

  it('the arcane surge makes slot spells free even with no slots, and is sent along', async () => {
    const { onCastSpell } = setup(menu({ slotsLeft: 0 }));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /ใช้เวทไหลล้น/ }));
    expect(screen.getByRole('button', { name: /ลูกไฟระเบิด · 1 ช่อง$/ })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /ลูกไฟระเบิด/ }));
    expect(onCastSpell).toHaveBeenCalledWith('fire_burst', {}, true);
  });

  it('the surge switch is locked while cooling down and shows how long', async () => {
    const { onCastSpell } = setup(menu({ surge: { nameTh: 'เวทไหลล้น', cooldown: 2 } }));
    await open();
    expect(screen.getByRole('checkbox', { name: /ใช้เวทไหลล้น/ })).toBeDisabled();
    expect(screen.getByText('อีก 2 รอบเหตุการณ์')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ลูกไฟระเบิด/ }));
    expect(onCastSpell).toHaveBeenCalledWith('fire_burst', {}, false);
  });

  it('shows an error and stays usable when the cast is rejected', async () => {
    const onCastSpell = vi.fn().mockRejectedValue(new Error('nope'));
    render(<ActionInput onSubmit={vi.fn()} spells={menu()} onCastSpell={onCastSpell} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /ลูกไฟระเบิด/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ส่ง action ไม่สำเร็จ/);
    expect(screen.getByRole('button', { name: /ลูกไฟระเบิด/ })).toBeEnabled();
  });

  it('is locked when the player cannot act or already acted', async () => {
    const { rerender } = render(<ActionInput onSubmit={vi.fn()} spells={menu()} onCastSpell={vi.fn()} alreadyActed />);
    expect(screen.getByRole('button', { name: 'ร่ายเวท' })).toBeDisabled();
    rerender(<ActionInput onSubmit={vi.fn()} spells={menu()} onCastSpell={vi.fn()} disabledReason="คุณล้มลง" />);
    expect(screen.getByRole('button', { name: 'ร่ายเวท' })).toBeDisabled();
  });
});
