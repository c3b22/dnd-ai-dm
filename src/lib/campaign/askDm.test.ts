import { describe, it, expect, vi } from 'vitest';
import { ADVENTURES } from '@/lib/adventures/adventures';
import { ASK_LIMIT_PER_ROUND, MAX_ASK_LENGTH, AskDmError, askDm } from './askDm';

const SECRET = 'THE-BUTLER-DID-IT-SECRET-XYZ';
const customAdventure = {
  id: 'adv-custom',
  title: 'Custom Tale',
  title_th: 'นิทาน',
  tagline: 't',
  tagline_th: 't',
  tone: 'dark',
  tone_th: 'มืด',
  setting: 'A foggy port',
  hook: 'A ship arrives empty',
  opening_th: 'เปิดเรื่อง',
  secret: SECRET,
  acts: ['ACT-ONE-HINT', 'ACT-TWO-HINT'],
  npcs: [{ name: 'Bram', role: 'NPC-ROLE-HINT secretly the villain' }],
  scenes: [{ key: 'dock', nameTh: 'ท่าเรือ', imagePath: null }],
};

interface Opts {
  players?: { id: string; user_id: string }[];
  askCount?: number;
  roundId?: string | null;
  adventureId?: string | null;
  sceneId?: string | null;
  insertError?: unknown;
}

function fake(o: Opts = {}) {
  const inserts: any[] = [];
  const countFilters: Record<string, unknown> = {};
  const players = o.players ?? [{ id: 'p1', user_id: 'u1' }];
  const chain = (table: string, result: () => any) => {
    const q: any = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        if (table === 'messages') countFilters[col] = val;
        return q;
      },
      in: () => q,
      gt: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve(result()),
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  };
  const client: any = {
    from: (table: string) => {
      if (table === 'players') return chain(table, () => ({ data: players[0] ?? null, error: null }));
      if (table === 'campaigns')
        return chain(table, () => ({
          data: {
            current_round_id: o.roundId === undefined ? 'r1' : o.roundId,
            adventure_id: o.adventureId === undefined ? 'adv-custom' : o.adventureId,
            current_scene_id: o.sceneId === undefined ? 'adv-custom-dock' : o.sceneId,
          },
          error: null,
        }));
      if (table === 'custom_adventures') return chain(table, () => ({ data: customAdventure, error: null }));
      if (table === 'campaign_summary') return chain(table, () => ({ data: { summary: 'SUMMARY-TEXT' }, error: null }));
      if (table === 'messages') {
        const q = chain(table, () => ({
          data: [{ role: 'dm', content: 'RECENT-DM-LINE' }],
          count: o.askCount ?? 0,
          error: null,
        }));
        q.insert = (p: unknown) => {
          inserts.push(p);
          return Promise.resolve({ error: o.insertError ?? null });
        };
        return q;
      }
      return chain(table, () => ({ data: null, error: null }));
    },
  };
  return { client, inserts, countFilters };
}

const base = { campaignId: 'c1', userId: 'u1', question: 'ประตูนั้นล็อกอยู่ไหม?' };

describe('askDm', () => {
  it('saves the question and a tag-free answer under the current round and asking player', async () => {
    const { client, inserts } = fake();
    const answer = vi.fn().mockResolvedValue('ล็อกอยู่ [[hurt: Bob | heavy]]ครับ[[scene: x]] [[roll d20]]');
    const res = await askDm(client, { ...base, question: '  ประตูนั้นล็อกอยู่ไหม?  ' }, { answer });
    expect(res.answer).toBe('ล็อกอยู่ ครับ');
    expect(inserts).toEqual([
      { campaign_id: 'c1', round_id: 'r1', role: 'ask', player_id: 'p1', content: 'ประตูนั้นล็อกอยู่ไหม?' },
      { campaign_id: 'c1', round_id: 'r1', role: 'ask_answer', player_id: 'p1', content: 'ล็อกอยู่ ครับ' },
    ]);
    expect(JSON.stringify(inserts)).not.toContain('[[');
  });

  it('counts only this player ask rows in this round and rejects over quota with 429', async () => {
    const { client, inserts, countFilters } = fake({ askCount: ASK_LIMIT_PER_ROUND });
    const answer = vi.fn();
    await expect(askDm(client, base, { answer })).rejects.toMatchObject({ status: 429 });
    expect(countFilters).toMatchObject({ campaign_id: 'c1', role: 'ask', player_id: 'p1', round_id: 'r1' });
    expect(answer).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('allows the last question under quota', async () => {
    const { client, inserts } = fake({ askCount: ASK_LIMIT_PER_ROUND - 1 });
    await askDm(client, base, { answer: async () => 'ok' });
    expect(inserts).toHaveLength(2);
  });

  it('rejects non-members with 403', async () => {
    const { client } = fake({ players: [] });
    const answer = vi.fn();
    await expect(askDm(client, base, { answer })).rejects.toMatchObject({ status: 403 });
    expect(answer).not.toHaveBeenCalled();
  });

  it('rejects empty, non-string and over-long questions with 400', async () => {
    const { client, inserts } = fake();
    const answer = vi.fn();
    for (const question of ['', '   ', 'x'.repeat(MAX_ASK_LENGTH + 1), 42 as any, undefined]) {
      await expect(askDm(client, { ...base, question }, { answer })).rejects.toMatchObject({ status: 400 });
    }
    expect(answer).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('rejects with 400 when the campaign has no open round', async () => {
    const { client } = fake({ roundId: null });
    await expect(askDm(client, base, { answer: vi.fn() })).rejects.toMatchObject({ status: 400 });
  });

  it('never puts the DM secret or hidden outline in the AI prompt, but includes summary and scene', async () => {
    const { client } = fake();
    const answer = vi.fn().mockResolvedValue('ok');
    await askDm(client, base, { answer });
    const prompt = answer.mock.calls[0][0] as string;
    expect(prompt).not.toContain(SECRET);
    expect(prompt).not.toContain('ACT-ONE-HINT');
    expect(prompt).not.toContain('NPC-ROLE-HINT');
    expect(prompt.toLowerCase()).not.toContain('hidden truth');
    expect(prompt).toContain('SUMMARY-TEXT');
    expect(prompt).toContain('RECENT-DM-LINE');
    expect(prompt).toContain('ท่าเรือ');
    expect(prompt).toContain('A foggy port');
    expect(prompt).toContain(base.question);
    expect(prompt).toContain('[[');
    expect(prompt).toMatch(/do not output any \[\[/i);
  });

  it('never includes the secret of a built-in adventure either', async () => {
    const adv = ADVENTURES[0];
    const { client } = fake({ adventureId: adv.id, sceneId: null });
    const answer = vi.fn().mockResolvedValue('ok');
    await askDm(client, base, { answer });
    const prompt = answer.mock.calls[0][0] as string;
    expect(prompt).toContain(adv.title);
    expect(prompt).not.toContain(adv.secret);
  });

  it('surfaces AI failure or an empty answer as 502 and saves nothing', async () => {
    for (const answer of [vi.fn().mockRejectedValue(new Error('boom')), vi.fn().mockResolvedValue('[[milestone]]')]) {
      const { client, inserts } = fake();
      const attempt = askDm(client, base, { answer });
      await expect(attempt).rejects.toBeInstanceOf(AskDmError);
      await expect(attempt).rejects.toMatchObject({ status: 502 });
      expect(inserts).toHaveLength(0);
    }
  });
});
