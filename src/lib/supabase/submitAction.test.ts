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
