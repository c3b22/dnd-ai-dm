import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AbilityChoice } from './AbilityChoice';

const abilities = { STR: 10, DEX: 12, CON: 14, INT: 8, WIS: 19, CHA: 10 };
const badge = /มีแต้มเพิ่มค่าความสามารถ/;

describe('AbilityChoice', () => {
  it('shows only the badge until pressed', () => {
    render(<AbilityChoice abilities={abilities} remaining={1} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: /มีแต้มเพิ่มค่าความสามารถ 1 ครั้ง/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ยืนยัน' })).toBeNull();
  });

  it('renders nothing when no points are left', () => {
    const { container } = render(<AbilityChoice abilities={abilities} remaining={0} onConfirm={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the remaining count when more than one', () => {
    render(<AbilityChoice abilities={abilities} remaining={2} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: /มีแต้มเพิ่มค่าความสามารถ 2 ครั้ง/ })).toBeTruthy();
  });

  it('confirms +2 on a single ability', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<AbilityChoice abilities={abilities} remaining={1} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: badge }));
    expect((screen.getByRole('button', { name: 'ยืนยัน' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('STR'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ kind: 'double', ability: 'STR' }));
  });

  it('confirms +1 on two different abilities, needing exactly two', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<AbilityChoice abilities={abilities} remaining={1} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: badge }));
    fireEvent.click(screen.getByLabelText('+1 สองค่า'));
    fireEvent.click(screen.getByLabelText('DEX'));
    expect((screen.getByRole('button', { name: 'ยืนยัน' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('CHA'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ kind: 'split', abilities: ['DEX', 'CHA'] }));
  });

  it('disables abilities that would pass 20', () => {
    render(<AbilityChoice abilities={abilities} remaining={1} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: badge }));
    expect((screen.getByLabelText('WIS') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('+1 สองค่า'));
    expect((screen.getByLabelText('WIS') as HTMLInputElement).disabled).toBe(false);
  });

  it('shows an error and stays open when saving fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('x'));
    render(<AbilityChoice abilities={abilities} remaining={1} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: badge }));
    fireEvent.click(screen.getByLabelText('STR'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeTruthy();
  });

  it('closes after a successful confirm', async () => {
    render(<AbilityChoice abilities={abilities} remaining={1} onConfirm={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: badge }));
    fireEvent.click(screen.getByLabelText('STR'));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'ยืนยัน' })).toBeNull());
  });
});
