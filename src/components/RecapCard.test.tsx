import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RecapCard } from './RecapCard';
import { parseRecapResponse, type RecapResult } from '@/lib/supabase/recapClient';

const text = (t: string): RecapResult => ({ kind: 'text', text: t });

describe('RecapCard', () => {
  it('does nothing until ready', () => {
    const load = vi.fn();
    render(<RecapCard ready={false} load={load} manualRequest={0} />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('ตอนที่แล้ว…')).toBeNull();
  });

  it('auto mode: shows loading, then the recap text', async () => {
    let resolve!: (r: RecapResult) => void;
    const load = vi.fn(() => new Promise<RecapResult>((r) => { resolve = r; }));
    render(<RecapCard ready load={load} manualRequest={0} />);
    expect(load).toHaveBeenCalledWith(false);
    expect(screen.getByText(/กำลังสรุปเรื่อง/)).toBeTruthy();
    await act(async () => resolve(text('คุณเดินเข้าถ้ำ')));
    expect(screen.getByLabelText('ตอนที่แล้ว…').textContent).toContain('คุณเดินเข้าถ้ำ');
  });

  it('auto mode asks only once', async () => {
    const load = vi.fn(async () => text('x'));
    const { rerender } = render(<RecapCard ready load={load} manualRequest={0} />);
    await screen.findByText('x');
    rerender(<RecapCard ready load={load} manualRequest={0} />);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('auto mode shows nothing when not needed or on error', async () => {
    const load = vi.fn(async (): Promise<RecapResult> => ({ kind: 'none' }));
    const { container } = render(<RecapCard ready load={load} manualRequest={0} />);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    const bad = vi.fn(async (): Promise<RecapResult> => ({ kind: 'error', status: 503 }));
    const r2 = render(<RecapCard ready load={bad} manualRequest={0} />);
    await waitFor(() => expect(bad).toHaveBeenCalled());
    expect(r2.container.textContent).toBe('');
  });

  it('can be dismissed', async () => {
    render(<RecapCard ready load={async () => text('เรื่องย่อ')} manualRequest={0} />);
    await screen.findByText('เรื่องย่อ');
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByText('เรื่องย่อ')).toBeNull();
  });

  it('manual request uses force and shows a Thai error on failure', async () => {
    const load = vi.fn(async (force: boolean): Promise<RecapResult> => (force ? { kind: 'error', status: 503 } : { kind: 'none' }));
    const { rerender } = render(<RecapCard ready load={load} manualRequest={0} />);
    await waitFor(() => expect(load).toHaveBeenCalledWith(false));
    rerender(<RecapCard ready load={load} manualRequest={1} />);
    await waitFor(() => expect(load).toHaveBeenCalledWith(true));
    expect(await screen.findByText(/สรุปเรื่องไม่สำเร็จ/)).toBeTruthy();
  });

  it('manual request shows text, or a nothing-to-summarise note when none', async () => {
    const load = vi.fn(async (force: boolean): Promise<RecapResult> => (force ? text('สรุปเอง') : { kind: 'none' }));
    const { rerender } = render(<RecapCard ready load={load} manualRequest={0} />);
    rerender(<RecapCard ready load={load} manualRequest={1} />);
    expect(await screen.findByText('สรุปเอง')).toBeTruthy();
    const none = vi.fn(async (): Promise<RecapResult> => ({ kind: 'none' }));
    const r2 = render(<RecapCard ready load={none} manualRequest={0} />);
    r2.rerender(<RecapCard ready load={none} manualRequest={1} />);
    expect(await screen.findByText(/ยังไม่มีอะไรให้สรุป/)).toBeTruthy();
  });
});

describe('parseRecapResponse', () => {
  it('maps responses', async () => {
    expect(await parseRecapResponse({ ok: true, status: 200, json: async () => ({ needed: false }) })).toEqual({ kind: 'none' });
    expect(await parseRecapResponse({ ok: true, status: 200, json: async () => ({ needed: true, text: 'a' }) })).toEqual({ kind: 'text', text: 'a' });
    expect(await parseRecapResponse({ ok: false, status: 503, json: async () => ({ error: 'x' }) })).toEqual({ kind: 'error', status: 503 });
    expect(await parseRecapResponse({ ok: true, status: 200, json: async () => { throw new Error('bad'); } })).toEqual({ kind: 'error', status: 500 });
  });
});
