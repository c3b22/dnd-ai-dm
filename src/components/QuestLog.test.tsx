import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QuestLog } from './QuestLog';
import type { CampaignFact } from '@/lib/memory/types';

let n = 0;
const fact = (kind: CampaignFact['kind'], key: string | null, value: string): CampaignFact => ({
  id: `f${++n}`, campaignId: 'c1', kind, key, value, updatedAt: '2026-10-06T00:00:00Z',
});

describe('QuestLog', () => {
  it('shows a friendly empty state when there are no facts', () => {
    render(<QuestLog facts={[]} />);
    expect(screen.getByLabelText('สมุดบันทึก')).toBeTruthy();
    expect(screen.getByText(/ยังไม่มีบันทึก/)).toBeTruthy();
    expect(screen.queryByText('ภารกิจ')).toBeNull();
    expect(screen.queryByText('NPC')).toBeNull();
    expect(screen.queryByText('เบาะแส')).toBeNull();
  });

  it('splits quests into open and done', () => {
    render(<QuestLog facts={[fact('quest', 'ตามหาแหวน', 'open'), fact('quest', 'ฆ่าหมาป่า', 'done'), fact('quest', 'แปลก', 'whatever')]} />);
    const open = screen.getByLabelText('ภารกิจที่ค้างอยู่');
    expect(open.textContent).toContain('ตามหาแหวน');
    expect(open.textContent).toContain('แปลก');
    expect(open.textContent).not.toContain('ฆ่าหมาป่า');
    const done = screen.getByLabelText('ภารกิจที่เสร็จแล้ว');
    expect(done.textContent).toContain('ฆ่าหมาป่า');
  });

  it('shows NPCs with their attitude and clues, hiding empty sections', () => {
    render(<QuestLog facts={[fact('npc', 'เกรตา', 'เป็นมิตร'), fact('clue', null, 'รอยเท้าไปทางเหนือ')]} />);
    const npcs = screen.getByLabelText('NPC ที่พบ');
    expect(within(npcs).getByText('เกรตา')).toBeTruthy();
    expect(within(npcs).getByText('เป็นมิตร')).toBeTruthy();
    expect(screen.getByLabelText('เบาะแส').textContent).toContain('รอยเท้าไปทางเหนือ');
    expect(screen.queryByLabelText('ภารกิจที่ค้างอยู่')).toBeNull();
    expect(screen.queryByLabelText('ภารกิจที่เสร็จแล้ว')).toBeNull();
    expect(screen.queryByText(/ยังไม่มีบันทึก/)).toBeNull();
  });

  it('renders fact text as plain text, never HTML', () => {
    const { container } = render(<QuestLog facts={[fact('clue', null, '<img src=x onerror=alert(1)><b>x</b>')]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
