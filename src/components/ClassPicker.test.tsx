import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassPicker } from './ClassPicker';

describe('ClassPicker', () => {
  it('offers the four classes with weapon, damage dice and ability and marks the chosen one', () => {
    render(<ClassPicker value="archer" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: /นักรบ/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /นักธนู/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /นักบวช/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /โจร/ })).toBeInTheDocument();
    expect(screen.getByText(/กริช/)).toBeInTheDocument();
    expect(screen.getByText(/ลอบโจมตี/)).toBeInTheDocument();
    expect(screen.getByText(/1d8/)).toBeInTheDocument();
  });

  it('reports the class id that was picked', () => {
    const onChange = vi.fn();
    render(<ClassPicker value="warrior" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /โจร/ }));

    expect(onChange).toHaveBeenCalledWith('rogue');
  });
});
