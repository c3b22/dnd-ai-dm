import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MyAdventures } from './MyAdventures';

const base = { id: 'c1', titleTh: 'เรื่องของฉัน', taglineTh: 'แท็กไลน์', thumbnailUrl: null };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('MyAdventures', () => {
  it('renders nothing when there are no custom adventures', () => {
    const { container } = render(<MyAdventures adventures={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each adventure with an edit link', () => {
    render(<MyAdventures adventures={[{ ...base, shareCode: null }]} />);
    expect(screen.getByText('เรื่องของฉัน')).toBeTruthy();
    expect(screen.getByText('แก้ไข').closest('a')).toHaveAttribute('href', '/adventures/c1/edit');
  });

  it('shares via the API and shows the link', async () => {
    const fetchMock = mockFetch({ shareCode: 'ABCD2345' });
    render(<MyAdventures adventures={[{ ...base, shareCode: null }]} getAccessToken={async () => 'tok'} />);
    fireEvent.click(screen.getByText('แชร์'));
    const link = `${window.location.origin}/adventures/shared/ABCD2345`;
    await waitFor(() => expect(screen.getByDisplayValue(link)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/adventures/c1/share', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    });
    expect(screen.getByText('ยกเลิกการแชร์')).toBeTruthy();
  });

  it('shows the link right away when already shared', () => {
    render(<MyAdventures adventures={[{ ...base, shareCode: 'ZZZZ2222' }]} />);
    expect(screen.getByDisplayValue(`${window.location.origin}/adventures/shared/ZZZZ2222`)).toBeTruthy();
    expect(screen.queryByText('แชร์')).toBeNull();
  });

  it('copies the link, or tells the user to copy it manually when the clipboard fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MyAdventures adventures={[{ ...base, shareCode: 'ZZZZ2222' }]} />);
    fireEvent.click(screen.getByText('คัดลอก'));
    await waitFor(() => expect(screen.getByText('คัดลอกแล้ว')).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/adventures/shared/ZZZZ2222`);

    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByText('คัดลอกแล้ว'));
    await waitFor(() => expect(screen.getByText('คัดลอกอัตโนมัติไม่ได้ โปรดก๊อปลิงก์ด้านบนเอง')).toBeTruthy());
  });

  it('unshares via DELETE and returns to the share button', async () => {
    const fetchMock = mockFetch({ shareCode: null });
    render(<MyAdventures adventures={[{ ...base, shareCode: 'ZZZZ2222' }]} getAccessToken={async () => 'tok'} />);
    fireEvent.click(screen.getByText('ยกเลิกการแชร์'));
    await waitFor(() => expect(screen.getByText('แชร์')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/adventures/c1/share', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('shows an error when sharing fails', async () => {
    mockFetch({ error: 'x' }, false);
    render(<MyAdventures adventures={[{ ...base, shareCode: null }]} getAccessToken={async () => 'tok'} />);
    fireEvent.click(screen.getByText('แชร์'));
    await waitFor(() => expect(screen.getByText('แชร์ไม่สำเร็จ ลองใหม่อีกครั้ง')).toBeTruthy());
    expect(screen.getByText('แชร์')).toBeTruthy();
  });
});
