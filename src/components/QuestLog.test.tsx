import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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
    expect(screen.queryByRole('button', { name: /ภารกิจ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /NPC/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /เบาะแส/ })).toBeNull();
  });

  it('splits quests into open and done', () => {
    render(<QuestLog facts={[fact('quest', 'ตามหาแหวน', 'open'), fact('quest', 'ฆ่าหมาป่า', 'done'), fact('quest', 'แปลก', 'whatever')]} />);
    const open = screen.getByLabelText('ภารกิจที่ค้างอยู่');
    expect(open.textContent).toContain('ตามหาแหวน');
    expect(open.textContent).toContain('แปลก');
    expect(open.textContent).not.toContain('ฆ่าหมาป่า');
    const done = screen.getByLabelText('ภารกิจที่เสร็จแล้ว');
    expect(done.textContent).not.toContain('ฆ่าหมาป่า');
    fireEvent.click(within(done).getByRole('button', { name: /ภารกิจที่เสร็จแล้ว/ }));
    expect(done.textContent).toContain('ฆ่าหมาป่า');
  });

  it('shows everything and a total count in the title when there is little data', () => {
    render(<QuestLog facts={[fact('quest', 'a', 'open'), fact('npc', 'b', 'x'), fact('clue', null, 'c'), fact('clue', null, 'd')]} />);
    expect(screen.getByRole('heading', { name: 'สมุดบันทึก (4)' })).toBeTruthy();
    expect(within(screen.getByLabelText('เบาะแส')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /ดูทั้งหมด/ })).toBeNull();
  });

  it('shows only the newest 5 per section and expands with the see-all button', () => {
    const clues = Array.from({ length: 8 }, (_, i) => ({ ...fact('clue', null, `clue${i}`), updatedAt: `2026-10-06T00:00:0${i}Z` }));
    render(<QuestLog facts={clues} />);
    const sec = screen.getByLabelText('เบาะแส');
    expect(within(sec).getAllByRole('listitem')).toHaveLength(5);
    expect(sec.textContent).toContain('clue7');
    expect(sec.textContent).not.toContain('clue0');
    fireEvent.click(within(sec).getByRole('button', { name: 'ดูทั้งหมด (8)' }));
    expect(within(sec).getAllByRole('listitem')).toHaveLength(8);
    expect(sec.querySelector('ul.expanded')).toBeTruthy();
    fireEvent.click(within(sec).getByRole('button', { name: 'ย่อ' }));
    expect(within(sec).getAllByRole('listitem')).toHaveLength(5);
  });

  it('collapses a section without dropping data', () => {
    render(<QuestLog facts={[fact('clue', null, 'รอยเท้า')]} />);
    const sec = screen.getByLabelText('เบาะแส');
    fireEvent.click(within(sec).getByRole('button', { name: /เบาะแส/ }));
    expect(sec.textContent).not.toContain('รอยเท้า');
    expect(screen.getByRole('heading', { name: 'สมุดบันทึก (1)' })).toBeTruthy();
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
