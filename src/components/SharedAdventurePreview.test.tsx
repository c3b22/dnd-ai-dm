import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SharedAdventurePreviewView } from './SharedAdventurePreview';

const { getSession, signInAnonymously, push } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabaseBrowserClient: { auth: { getSession, signInAnonymously } },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const preview = {
  title: 'Dragon', titleTh: 'มังกรหลับ', tagline: 'Tag', taglineTh: 'แทกไลน์ไทย', tone: 'Dark', toneTh: 'มืดมน',
  setting: 'A cold keep', hook: 'A letter arrives', openingTh: 'เปิดเรื่องไทย', actCount: 3, npcCount: 2, hasOpeningImage: false,
};
const existingSession = { data: { session: { access_token: 'tok', user: { id: 'u1' } } } };

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn();
  getSession.mockReset().mockResolvedValue(existingSession);
  signInAnonymously.mockReset();
  push.mockReset();
});
afterEach(() => { global.fetch = originalFetch; });

describe('SharedAdventurePreviewView', () => {
  it('loads and shows the preview without any secret', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => preview });
    render(<SharedAdventurePreviewView code="abcd1234" />);
    await waitFor(() => expect(screen.getByText('มังกรหลับ')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith('/api/adventures/shared/abcd1234');
    expect(screen.getByText('เปิดเรื่องไทย')).toBeTruthy();
    expect(screen.queryByText(/ความลับ/)).toBeNull();
  });

  it('shows the Thai not-found message for an invalid code', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'shared adventure not found' }) });
    render(<SharedAdventurePreviewView code="nope" />);
    await waitFor(() =>
      expect(screen.getByText('ไม่พบโครงเรื่องนี้ หรือเจ้าของยกเลิกการแชร์แล้ว')).toBeTruthy()
    );
    expect(screen.queryByText('เพิ่มเข้าคลังของฉัน')).toBeNull();
  });

  it('imports with the bearer token and redirects home', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 'custom-9' }) });
    render(<SharedAdventurePreviewView code="abcd1234" />);
    await waitFor(() => screen.getByText('เพิ่มเข้าคลังของฉัน'));
    fireEvent.click(screen.getByText('เพิ่มเข้าคลังของฉัน'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(signInAnonymously).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/adventures/shared/abcd1234/import',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
  });

  it('signs a first-time visitor in anonymously before importing', async () => {
    const newSession = { access_token: 'anon-tok', user: { id: 'anon-1' } };
    getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: newSession } });
    signInAnonymously.mockResolvedValue({ data: { user: newSession.user }, error: null });
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 'custom-9' }) });
    render(<SharedAdventurePreviewView code="abcd1234" />);
    await waitFor(() => screen.getByText('เพิ่มเข้าคลังของฉัน'));
    fireEvent.click(screen.getByText('เพิ่มเข้าคลังของฉัน'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/adventures/shared/abcd1234/import',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer anon-tok' }) })
    );
  });

  it('shows a Thai error and does not import when sign-in fails', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({ data: { user: null }, error: new Error('down') });
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => preview });
    render(<SharedAdventurePreviewView code="abcd1234" />);
    await waitFor(() => screen.getByText('เพิ่มเข้าคลังของฉัน'));
    fireEvent.click(screen.getByText('เพิ่มเข้าคลังของฉัน'));
    await waitFor(() => expect(screen.getByText('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a Thai error when importing fails and stays on the page', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'cannot import your own adventure' }) });
    render(<SharedAdventurePreviewView code="abcd1234" />);
    await waitFor(() => screen.getByText('เพิ่มเข้าคลังของฉัน'));
    fireEvent.click(screen.getByText('เพิ่มเข้าคลังของฉัน'));
    await waitFor(() => expect(screen.getByText('นี่คือเนื้อเรื่องของคุณเองอยู่แล้ว')).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});
