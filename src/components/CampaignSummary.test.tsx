import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CampaignSummary } from './CampaignSummary';
import { emptyStats } from '@/lib/campaign/stats';
import type { RoundPlayer } from '@/lib/supabase/players';

const player = (over: Partial<RoundPlayer>): RoundPlayer => ({
  id: 'p1', displayName: 'ซูกิ', acted: false, isOwner: true, hp: 10, maxHp: 10, xp: 0, items: [], status: 'active', gold: 0, ...over,
});

describe('CampaignSummary', () => {
  it('shows the epilogue without its marker line', () => {
    render(<CampaignSummary epilogue={'— บทส่งท้าย —\nซูกิกลับบ้าน'} stats={null} players={[]} facts={[]} />);
    const region = screen.getByRole('region', { name: 'สรุปแคมเปญ' });
    expect(within(region).getByText(/ซูกิกลับบ้าน/)).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'บทส่งท้าย' })).toBeInTheDocument();
    expect(region.textContent).not.toContain('— บทส่งท้าย —');
  });

  it('says the epilogue is still being written when there is none', () => {
    render(<CampaignSummary epilogue={null} stats={null} players={[]} facts={[]} />);
    expect(screen.getByText(/กำลังเขียนบทส่งท้าย/)).toBeInTheDocument();
  });

  it('lists the stats', () => {
    const stats = { ...emptyStats(), rounds: 42, gold: 130, magicItems: 2, downs: 3, deaths: 1, nat20: 4, defeated: { minion: 5, normal: 3, strong: 2, boss: 1 } };
    render(<CampaignSummary epilogue={null} stats={stats} players={[]} facts={[]} />);
    const list = screen.getByRole('list', { name: 'สถิติ' });
    expect(list).toHaveTextContent('42');
    expect(list).toHaveTextContent('130');
    expect(list).toHaveTextContent('ศัตรูที่ล้ม 11');
    expect(list).toHaveTextContent('บอส 1');
  });

  it('shows each character with level and items', () => {
    const p = player({ xp: 300, items: [{ itemId: 'x', customName: 'ดาบเก่า', quantity: 1, slot: null, equipped: false }] });
    render(<CampaignSummary epilogue={null} stats={null} players={[p]} facts={[]} />);
    const chars = screen.getByRole('list', { name: 'ตัวละคร' });
    expect(chars).toHaveTextContent('ซูกิ');
    expect(chars).toHaveTextContent(/เลเวล \d+/);
  });

  it('embeds the quest log', () => {
    render(<CampaignSummary epilogue={null} stats={null} players={[]} facts={[{ id: 'f1', kind: 'quest', key: 'หาระฆัง', value: 'done' } as any]} />);
    expect(screen.getByText('หาระฆัง')).toBeInTheDocument();
  });
});
