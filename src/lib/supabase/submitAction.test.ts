import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('./client', () => ({
  supabaseBrowserClient: { from: () => ({ insert: (row: unknown) => insert(row) }) },
}));

import { submitAction } from './submitAction';

describe('submitAction', () => {
  beforeEach(() => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
  });

  it('submits a plain action without any ability or item columns', async () => {
    await submitAction('r1', 'p1', 'โจมตี');
    expect(insert).toHaveBeenCalledWith({ round_id: 'r1', player_id: 'p1', action_text: 'โจมตี' });
  });

  it('flags an ability use with its target', async () => {
    await submitAction('r1', 'p1', 'ใช้ยืนบัง ปกป้อง Suki', undefined, { targetId: 'p2' });
    expect(insert).toHaveBeenCalledWith({
      round_id: 'r1',
      player_id: 'p1',
      action_text: 'ใช้ยืนบัง ปกป้อง Suki',
      use_ability: true,
      ability_target_id: 'p2',
    });
  });

  it('flags an ability that needs no target without a target column', async () => {
    await submitAction('r1', 'p1', 'ใช้ยิงแม่นยำ', undefined, {});
    expect(insert).toHaveBeenCalledWith({ round_id: 'r1', player_id: 'p1', action_text: 'ใช้ยิงแม่นยำ', use_ability: true });
  });

  it('throws when the insert fails', async () => {
    insert.mockResolvedValue({ error: new Error('nope') });
    await expect(submitAction('r1', 'p1', 'x')).rejects.toThrow('nope');
  });
});

describe('submitAction item target (F5e)', () => {
  it('sends the enemy a scroll is aimed at', async () => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
    await submitAction('r1', 'p1', 'ใช้ม้วนคัมภีร์', 'scroll_spark', undefined, 'หมาป่า');
    expect(insert).toHaveBeenCalledWith({ round_id: 'r1', player_id: 'p1', action_text: 'ใช้ม้วนคัมภีร์', use_item_id: 'scroll_spark', item_target: 'หมาป่า' });
  });
});

describe('submitAction spells (K4)', () => {
  const reset = () => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
  };
  it('sends the spell id and the enemy it is aimed at', async () => {
    reset();
    await submitAction('r1', 'p1', 'ร่ายแสงเวทพุ่ง', undefined, undefined, undefined, { spellId: 'arcane_bolt', enemy: 'หมาป่า' });
    expect(insert).toHaveBeenCalledWith({ round_id: 'r1', player_id: 'p1', action_text: 'ร่ายแสงเวทพุ่ง', spell_id: 'arcane_bolt', item_target: 'หมาป่า' });
  });
  it('sends a friend target and flags the arcane surge as an ability use', async () => {
    reset();
    await submitAction('r1', 'p1', 'ร่ายโล่เวท', undefined, undefined, undefined, { spellId: 'arcane_shield', targetId: 'p2', surge: true });
    expect(insert).toHaveBeenCalledWith({ round_id: 'r1', player_id: 'p1', action_text: 'ร่ายโล่เวท', spell_id: 'arcane_shield', ability_target_id: 'p2', use_ability: true });
  });
  it('a spell without a target sends only the spell id', async () => {
    reset();
    await submitAction('r1', 'p1', 'ร่ายลูกไฟระเบิด', undefined, undefined, undefined, { spellId: 'fire_burst' });
    expect(insert).toHaveBeenCalledWith({ round_id: 'r1', player_id: 'p1', action_text: 'ร่ายลูกไฟระเบิด', spell_id: 'fire_burst' });
  });
});
