import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeaponPicker } from './WeaponPicker';

describe('WeaponPicker', () => {
  it('offers the three starting weapons with their damage dice and marks the chosen one', () => {
    render(<WeaponPicker value="shortbow" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: /ดาบสั้น/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /ธนูสั้น/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /ไม้เท้า/ })).toBeInTheDocument();
    expect(screen.getByText(/1d8/)).toBeInTheDocument();
  });

  it('reports the weapon id that was picked', () => {
    const onChange = vi.fn();
    render(<WeaponPicker value="shortsword" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /ไม้เท้า/ }));

    expect(onChange).toHaveBeenCalledWith('staff');
  });
});
