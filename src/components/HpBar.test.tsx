import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HpBar } from './HpBar';

describe('HpBar', () => {
  it('shows current and max HP', () => {
    render(<HpBar hp={12} maxHp={20} />);
    expect(screen.getByLabelText('HP 12 จาก 20')).toBeInTheDocument();
    expect(screen.getByText('12/20')).toBeInTheDocument();
  });

  it('shows how much max HP has been lost', () => {
    render(<HpBar hp={5} maxHp={14} />);
    expect(screen.getByText(/max −6/)).toBeInTheDocument();
  });

  it('flags low health', () => {
    const { container } = render(<HpBar hp={4} maxHp={20} />);
    expect(container.querySelector('.hp-fill.low')).not.toBeNull();
  });
});
