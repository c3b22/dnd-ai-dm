import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdventureForm } from './AdventureForm';

const { getSession, signInAnonymously } = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabaseBrowserClient: { auth: { getSession, signInAnonymously } },
}));

const existingSession = { data: { session: { access_token: 'token-123', user: { id: 'user-1' } } } };

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn();
  getSession.mockReset().mockResolvedValue(existingSession);
  signInAnonymously.mockReset();
});
afterEach(() => { global.fetch = originalFetch; });

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('ชื่อเรื่อง (ไทย)'), { target: { value: 'ชื่อ' } });
  fireEvent.change(screen.getByLabelText('ชื่อเรื่อง (อังกฤษ)'), { target: { value: 'Title' } });
  fireEvent.change(screen.getByLabelText('แทกไลน์ (ไทย)'), { target: { value: 'แทกไลน์' } });
  fireEvent.change(screen.getByLabelText('แทกไลน์ (อังกฤษ)'), { target: { value: 'Tagline' } });
  fireEvent.change(screen.getByLabelText('อารมณ์เรื่อง (ไทย)'), { target: { value: 'มืดมน' } });
  fireEvent.change(screen.getByLabelText('อารมณ์เรื่อง (อังกฤษ)'), { target: { value: 'Dark' } });
  fireEvent.change(screen.getByLabelText('ฉาก (อังกฤษ)'), { target: { value: 'Setting' } });
  fireEvent.change(screen.getByLabelText('จุดเกี่ยว (อังกฤษ)'), { target: { value: 'Hook' } });
  fireEvent.change(screen.getByLabelText('บทเปิดเรื่อง (ไทย)'), { target: { value: 'เปิดเรื่อง' } });
  fireEvent.change(screen.getByLabelText('ความลับ (อังกฤษ)'), { target: { value: 'Secret' } });
  fireEvent.change(screen.getByLabelText(/องก์ที่ 1/), { target: { value: 'องก์ที่หนึ่ง' } });
}

describe('AdventureForm — step 1, create', () => {
  it('starts with one empty act and lets you add another', () => {
    render(<AdventureForm />);
    expect(screen.getAllByLabelText(/องก์ที่/).length).toBe(1);
    fireEvent.click(screen.getByText('+ เพิ่มองก์'));
    expect(screen.getAllByLabelText(/องก์ที่/).length).toBe(2);
  });

  it('removes an act row', () => {
    render(<AdventureForm />);
    fireEvent.click(screen.getByText('+ เพิ่มองก์'));
    fireEvent.click(screen.getAllByText('ลบ')[0]);
    expect(screen.getAllByLabelText(/องก์ที่/).length).toBe(1);
  });

  it('adds and removes an NPC row', () => {
    render(<AdventureForm />);
    expect(screen.queryAllByLabelText(/ชื่อ NPC/).length).toBe(0);
    fireEvent.click(screen.getByText('+ เพิ่ม NPC'));
    expect(screen.getAllByLabelText(/ชื่อ NPC/).length).toBe(1);
  });

  it('submits step 1 to POST /api/adventures and moves to step 2 on success', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'custom-1', scenes: [{ key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: null }] }),
    });
    render(<AdventureForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByText('สร้างเนื้อเรื่อง'));
    await waitFor(() => expect(screen.getByText('ภาพเปิดเรื่อง')).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith('/api/adventures', expect.objectContaining({ method: 'POST' }));
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs a first-time visitor in anonymously before submitting, and sends their token', async () => {
    const newSession = { access_token: 'anon-token', user: { id: 'anon-1' } };
    getSession
      .mockResolvedValueOnce({ data: { session: null } }) // ensureAnonymousUser: no session yet
      .mockResolvedValue({ data: { session: newSession } }); // after anonymous sign-in
    signInAnonymously.mockResolvedValue({ data: { user: newSession.user }, error: null });
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'custom-1', scenes: [] }),
    });
    render(<AdventureForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByText('สร้างเนื้อเรื่อง'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/adventures',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer anon-token' }) })
    );
  });

  it('shows a Thai error and does not submit when anonymous sign-in fails', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({ data: { user: null }, error: new Error('auth down') });
    render(<AdventureForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByText('สร้างเนื้อเรื่อง'));
    await waitFor(() => expect(screen.getByText('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง')).toBeTruthy());
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('AdventureForm — editing', () => {
  it('pre-fills values and shows step 2 immediately', () => {
    render(
      <AdventureForm
        existing={{
          id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH',
          setting: 'S', hook: 'H', openingTh: 'O', secret: 'Sec', acts: ['Act 1'], npcs: [],
          scenes: [{ key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: 'https://cdn/custom-1/opening.jpg' }],
        }}
      />
    );
    expect((screen.getByLabelText('ชื่อเรื่อง (ไทย)') as HTMLInputElement).value).toBe('TH');
    expect(screen.getByText('ภาพเปิดเรื่อง')).toBeTruthy();
  });

  it('submits changes to PATCH /api/adventures/[id]', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'custom-1', scenes: [] }) });
    render(<AdventureForm existing={{ id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH', setting: 'S', hook: 'H', openingTh: 'O', secret: 'Sec', acts: ['Act 1'], npcs: [], scenes: [] }} />);
    fireEvent.click(screen.getByText('บันทึก'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/adventures/custom-1', expect.objectContaining({ method: 'PATCH' })));
  });
});

describe('AdventureForm — step 2, image upload', () => {
  it('uploads a file for a scene slot', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'custom-1', scenes: [{ key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: null }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imageUrl: 'https://cdn/custom-1/opening.jpg' }) });
    render(<AdventureForm />);
    fillRequiredFields();
    fireEvent.click(screen.getByText('สร้างเนื้อเรื่อง'));
    await waitFor(() => expect(screen.getByText('ภาพเปิดเรื่อง')).toBeTruthy());
    const input = screen.getByLabelText('ภาพเปิดเรื่อง') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenLastCalledWith('/api/adventures/custom-1/scenes/opening/image', expect.objectContaining({ method: 'POST' }))
    );
    await waitFor(() => expect((screen.getByAltText('ภาพเปิดเรื่อง') as HTMLImageElement).src).toBe('https://cdn/custom-1/opening.jpg'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  const editing = {
    id: 'custom-1', title: 'T', titleTh: 'TH', tagline: 'Tag', taglineTh: 'TagTH', tone: 'Tone', toneTh: 'ToneTH',
    setting: 'S', hook: 'H', openingTh: 'O', secret: 'Sec', acts: ['Act 1'], npcs: [],
    scenes: [
      { key: 'opening', nameTh: 'ภาพเปิดเรื่อง', imagePath: null },
      { key: 'act-1', nameTh: 'ภาพองก์ที่ 1', imagePath: null },
    ],
  };

  function pickFile(label: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
  }

  it('shows a Thai error next to the slot when the server rejects the file', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'file is too large (max 5MB)' }) });
    render(<AdventureForm existing={editing} />);
    pickFile('ภาพเปิดเรื่อง');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)');
    expect(alert.className).toBe('error');
    // Rendered inside the rejected scene's own slot, not another one.
    expect(alert.parentElement?.querySelector('#scene-image-opening')).not.toBeNull();
  });

  it('shows a generic Thai error for an unrecognised or unreadable error body', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, json: async () => { throw new Error('not json'); } });
    render(<AdventureForm existing={editing} />);
    pickFile('ภาพเปิดเรื่อง');
    expect((await screen.findByRole('alert')).textContent).toBe('อัปโหลดภาพไม่สำเร็จ');
  });

  it('shows a generic Thai error on a network failure instead of an unhandled rejection', async () => {
    (global.fetch as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<AdventureForm existing={editing} />);
    pickFile('ภาพเปิดเรื่อง');
    expect((await screen.findByRole('alert')).textContent).toBe('อัปโหลดภาพไม่สำเร็จ');
  });

  it('clears a scene error when that scene is retried successfully, and keeps errors per scene', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'file must be an image' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'invalid image data' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imageUrl: 'https://cdn/custom-1/opening.jpg?v=1' }) });
    render(<AdventureForm existing={editing} />);
    pickFile('ภาพเปิดเรื่อง');
    await screen.findByText('ไฟล์ต้องเป็นรูปภาพ');
    pickFile('ภาพองก์ที่ 1');
    await screen.findByText('ไฟล์ภาพไม่ถูกต้องหรือเสียหาย');
    expect(screen.getAllByRole('alert').length).toBe(2);
    pickFile('ภาพเปิดเรื่อง');
    await waitFor(() => expect(screen.queryByText('ไฟล์ต้องเป็นรูปภาพ')).toBeNull());
    expect(screen.getByText('ไฟล์ภาพไม่ถูกต้องหรือเสียหาย')).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBe(1);
  });
});
