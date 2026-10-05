import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdventureForm } from './AdventureForm';

vi.mock('@/lib/supabase/client', () => ({
  supabaseBrowserClient: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token-123' } } }) },
  },
}));

const originalFetch = global.fetch;
beforeEach(() => { global.fetch = vi.fn(); });
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
  });
});
