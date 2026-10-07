import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EncounterPanel, pipLevel } from './EncounterPanel';
import type { Encounter, EncounterEnemy } from '@/lib/combat/encounter';

const enemy = (over: Partial<EncounterEnemy> = {}): EncounterEnemy => ({
  name: 'หมาป่า',
  tier: 'normal',
  pip: 2,
  maxPip: 2,
  fled: false,
  ...over,
});

describe('pipLevel', () => {
  it('boss with 5 pips: full ok, 4-2 warn, 1 low', () => {
    expect(pipLevel(5, 5)).toBe('ok');
    expect(pipLevel(4, 5)).toBe('warn');
    expect(pipLevel(3, 5)).toBe('warn');
    expect(pipLevel(2, 5)).toBe('warn');
    expect(pipLevel(1, 5)).toBe('low');
  });
  it('2 pip enemy: full ok, 1 low', () => {
    expect(pipLevel(2, 2)).toBe('ok');
    expect(pipLevel(1, 2)).toBe('low');
  });
  it('1 pip minion is only ok', () => {
    expect(pipLevel(1, 1)).toBe('ok');
  });
});

describe('EncounterPanel', () => {
  it('renders nothing without an encounter', () => {
    const { container } = render(<EncounterPanel encounter={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows each enemy with its remaining pips', () => {
    const encounter: Encounter = { enemies: [enemy({ pip: 1 }), enemy({ name: 'ราชา', tier: 'boss', pip: 4, maxPip: 5 })] };
    const { container } = render(<EncounterPanel encounter={encounter} />);
    expect(screen.getByLabelText('ศัตรู')).toBeInTheDocument();
    expect(screen.getByLabelText('หมาป่า เหลือ 1 จาก 2')).toBeInTheDocument();
    expect(screen.getByLabelText('ราชา เหลือ 4 จาก 5')).toBeInTheDocument();
    const boss = screen.getByText('ราชา').closest('li')!;
    expect(boss.querySelectorAll('.pip.on')).toHaveLength(4);
    expect(boss.querySelectorAll('.pip')).toHaveLength(5);
    expect(boss.querySelector('.hp-track.warn')).not.toBeNull();
    expect(container.querySelector('li .hp-track.low')).not.toBeNull();
  });

  it('marks a defeated enemy with a strikethrough class', () => {
    render(<EncounterPanel encounter={{ enemies: [enemy({ pip: 0 }), enemy({ name: 'โจร', pip: 2 })] }} />);
    expect(screen.getByText('หมาป่า').closest('li')).toHaveClass('is-dead');
    expect(screen.getByText('โจร').closest('li')).not.toHaveClass('is-dead');
  });

  it('shows a fled badge and does not count it as defeated', () => {
    render(<EncounterPanel encounter={{ enemies: [enemy({ fled: true, pip: 1 }), enemy({ name: 'โจร' })] }} />);
    const row = screen.getByText('หมาป่า').closest('li')!;
    expect(row).toHaveClass('is-fled');
    expect(row).not.toHaveClass('is-dead');
    expect(screen.getByText('หนี')).toBeInTheDocument();
  });

  it('is not collapsible with 4 or fewer enemies', () => {
    const enemies = [1, 2, 3, 4].map((n) => enemy({ name: `ศัตรู ${n}` }));
    render(<EncounterPanel encounter={{ enemies }} />);
    expect(screen.queryByRole('button', { name: /ย่อ|ขยาย/ })).toBeNull();
  });

  it('is collapsible with more than 4 enemies', () => {
    const enemies = [1, 2, 3, 4, 5].map((n) => enemy({ name: `ศัตรู ${n}` }));
    const { container } = render(<EncounterPanel encounter={{ enemies }} />);
    const toggle = screen.getByRole('button', { name: 'ย่อรายการศัตรู' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(container.querySelector('.enc-list')).toHaveClass('collapsed');
    expect(screen.getByRole('button', { name: 'ขยายรายการศัตรู' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows Thai trait badges and none for an enemy without traits', () => {
    render(<EncounterPanel encounter={{ enemies: [enemy({ traits: ['armored', 'pack'] }), enemy({ name: 'โจร' })] }} />);
    expect(screen.getByText('เกราะหนา')).toBeInTheDocument();
    expect(screen.getByText('ล่าเป็นฝูง')).toBeInTheDocument();
    expect(screen.getByLabelText('นิสัยของ หมาป่า')).toBeInTheDocument();
    expect(screen.queryByLabelText('นิสัยของ โจร')).toBeNull();
  });
});
