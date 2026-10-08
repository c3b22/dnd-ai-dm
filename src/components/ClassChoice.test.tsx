import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClassChoice } from './ClassChoice';
import type { PendingChoice } from '@/lib/character/classOptionsView';

const sub: PendingChoice = {
  kind: 'subclass', level: 3,
  options: [{ id: 'warrior_guardian', nameTh: 'ผู้พิทักษ์', descTh: 'บัง' }, { id: 'warrior_berserker', nameTh: 'นักรบคลั่ง', descTh: 'คลั่ง' }],
};
const pick: PendingChoice = { kind: 'pick', level: 6, options: [{ id: 'warrior_war_cry', nameTh: 'เสียงคำราม', descTh: 'x' }] };

describe('ClassChoice', () => {
  it('renders nothing without choices', () => {
    const { container } = render(<ClassChoice choices={[]} onChoose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows only a badge until pressed, and counts the others', () => {
    render(<ClassChoice choices={[sub, pick]} onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /เลือกสายอาชีพ \(เลเวล 3\).*อีก 1 ครั้ง/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ยืนยัน' })).toBeNull();
  });

  it('confirms the picked option, only once one is selected', async () => {
    const onChoose = vi.fn().mockResolvedValue(undefined);
    render(<ClassChoice choices={[sub]} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /เลือกสายอาชีพ/ }));
    expect((screen.getByRole('button', { name: 'ยืนยัน' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('นักรบคลั่ง'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(sub, 'warrior_berserker'));
  });

  it('shows an error and keeps the panel open when saving fails', async () => {
    render(<ClassChoice choices={[pick]} onChoose={vi.fn().mockRejectedValue(new Error('x'))} />);
    fireEvent.click(screen.getByRole('button', { name: /เลือกท่าใหม่/ }));
    fireEvent.click(screen.getByLabelText('เสียงคำราม'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('บันทึกไม่สำเร็จ'));
    expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeTruthy();
  });
});
