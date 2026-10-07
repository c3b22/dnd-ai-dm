import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RespawnForm } from './RespawnForm';

describe('RespawnForm', () => {
  it('tells the starting level and reuses the class picker', () => {
    render(<RespawnForm startLevel={4} onSubmit={async () => {}} />);

    expect(screen.getByText(/เลเวล 4/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /นักรบ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /สร้างตัวละครใหม่/ })).toBeDisabled();
  });

  it('submits the name, class and identity fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RespawnForm startLevel={1} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('display name'), { target: { value: 'Nova' } });
    fireEvent.click(screen.getByRole('button', { name: /โจร/ }));
    fireEvent.change(screen.getByLabelText('backstory'), { target: { value: 'ลูกศิษย์ของผู้ตาย' } });
    fireEvent.click(screen.getByRole('button', { name: /สร้างตัวละครใหม่/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      displayName: 'Nova',
      classId: 'rogue',
      backstory: 'ลูกศิษย์ของผู้ตาย',
    });
  });

  it('shows an error message instead of crashing when the request fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('conflict'));
    render(<RespawnForm startLevel={1} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('display name'), { target: { value: 'Nova' } });
    fireEvent.click(screen.getByRole('button', { name: /สร้างตัวละครใหม่/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ถูกสร้างใหม่ไปแล้ว');
    expect(screen.getByRole('button', { name: /สร้างตัวละครใหม่/ })).not.toBeDisabled();
  });
});
