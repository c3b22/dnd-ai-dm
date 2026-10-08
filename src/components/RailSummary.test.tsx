import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailSummary, roundStatusText } from './RailSummary';

describe('roundStatusText', () => {
  it('prioritises ended, then processing, then dead, then acted', () => {
    const base = { ended: false, processing: false, dead: false, acted: false, progress: { acted: 1, total: 3 } };
    expect(roundStatusText({ ...base, ended: true, processing: true })).toBe('จบแคมเปญ');
    expect(roundStatusText({ ...base, processing: true })).toBe('DM กำลังเล่าเรื่อง');
    expect(roundStatusText({ ...base, dead: true })).toBe('ล้มแล้ว');
    expect(roundStatusText({ ...base, acted: true })).toBe('ส่งแล้ว 1/3');
    expect(roundStatusText(base)).toBe('รอคุณ 1/3');
  });

  it('omits the counter when progress is unknown', () => {
    expect(roundStatusText({ ended: false, processing: false, dead: false, acted: false, progress: null })).toBe('รอคุณ');
  });
});

describe('RailSummary', () => {
  it('shows name, HP, gold and status on one strip', () => {
    render(<RailSummary name="อารี" hp={7} maxHp={10} gold={25} status="รอคุณ 1/3" />);
    const strip = screen.getByLabelText('สรุปตัวละคร');
    expect(strip.textContent).toContain('อารี');
    expect(strip.textContent).toContain('HP 7/10');
    expect(strip.textContent).toContain('25 ทอง');
    expect(strip.textContent).toContain('รอคุณ 1/3');
  });
});
