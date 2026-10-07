import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShareCodeEntry } from './ShareCodeEntry';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('ShareCodeEntry', () => {
  it('navigates to the shared adventure page for a bare code', () => {
    push.mockClear();
    render(<ShareCodeEntry />);
    fireEvent.change(screen.getByLabelText('share code'), { target: { value: 'ab23cdef' } });
    fireEvent.click(screen.getByRole('button', { name: 'ดูโครงเรื่อง' }));
    expect(push).toHaveBeenCalledWith('/adventures/shared/AB23CDEF');
  });

  it('accepts a full link', () => {
    push.mockClear();
    render(<ShareCodeEntry />);
    fireEvent.change(screen.getByLabelText('share code'), {
      target: { value: 'http://localhost:3000/adventures/shared/AB23CDEF' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ดูโครงเรื่อง' }));
    expect(push).toHaveBeenCalledWith('/adventures/shared/AB23CDEF');
  });

  it('disables the button when empty and shows an error for an unusable value', () => {
    push.mockClear();
    render(<ShareCodeEntry />);
    expect(screen.getByRole('button', { name: 'ดูโครงเรื่อง' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('share code'), { target: { value: 'ab cd' } });
    fireEvent.click(screen.getByRole('button', { name: 'ดูโครงเรื่อง' }));
    expect(screen.getByRole('alert')).toHaveTextContent('โค้ดหรือลิงก์ไม่ถูกต้อง');
    expect(push).not.toHaveBeenCalled();
  });
});
