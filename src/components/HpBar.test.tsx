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

  it('uses three colour levels with boundaries at 0.3 and 0.6', () => {
    const cls = (hp: number) => {
      const { container, unmount } = render(<HpBar hp={hp} maxHp={20} />);
      const c = container.querySelector('.hp-fill')!.className;
      unmount();
      return c;
    };
    expect(cls(20)).toBe('hp-fill');
    expect(cls(13)).toBe('hp-fill'); // 0.65 > 0.6
    expect(cls(12)).toBe('hp-fill mid'); // exactly 0.6 is yellow
    expect(cls(7)).toBe('hp-fill mid'); // 0.35
    expect(cls(6)).toBe('hp-fill low'); // exactly 0.3 stays red
    expect(cls(0)).toBe('hp-fill low');
  });

  it('shows the level badge and XP progress toward the next level', () => {
    render(<HpBar hp={30} maxHp={30} xp={150} />);
    expect(screen.getByText('Lv 3')).toBeInTheDocument();
    expect(screen.getByLabelText('XP 0 จาก 120')).toBeInTheDocument();
  });

  it('does not treat the level bonus as lost max HP', () => {
    render(<HpBar hp={30} maxHp={30} xp={150} />);
    expect(screen.queryByText(/max −/)).toBeNull();
  });

  it('still shows revive losses on top of the level bonus', () => {
    render(<HpBar hp={20} maxHp={28} xp={150} />);
    expect(screen.getByText(/max −2/)).toBeInTheDocument();
  });

  it('shows MAX instead of a progress bar at the top level', () => {
    render(<HpBar hp={65} maxHp={65} xp={1620} />);
    expect(screen.getByText('Lv 10')).toBeInTheDocument();
    expect(screen.getByText('MAX')).toBeInTheDocument();
  });
});
