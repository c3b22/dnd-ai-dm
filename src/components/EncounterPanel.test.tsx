import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EncounterPanel, pipLevel } from './EncounterPanel';
import type { Encounter, EncounterEnemy } from '@/lib/combat/encounter';

const enemy = (over: Partial<EncounterEnemy> = {}): EncounterEnemy => ({
  name: 'หมาป่า',
  tier: 'normal',
  pip: 4,
  maxPip: 4,
  fled: false,
  ...over,
});

describe('pipLevel', () => {
  it('boss with 10 pips: full ok, 9-3 warn, 2-1 low', () => {
    expect(pipLevel(10, 10)).toBe('ok');
    for (const n of [9, 8, 7, 6, 5, 4, 3]) expect(pipLevel(n, 10)).toBe('warn');
    expect(pipLevel(2, 10)).toBe('low');
    expect(pipLevel(1, 10)).toBe('low');
  });
  it('6 pip strong enemy: low only at the last pip', () => {
    expect(pipLevel(6, 6)).toBe('ok');
    expect(pipLevel(2, 6)).toBe('warn');
    expect(pipLevel(1, 6)).toBe('low');
  });
  it('4 pip enemy: full ok, 3-2 warn, 1 low', () => {
    expect(pipLevel(4, 4)).toBe('ok');
    expect(pipLevel(3, 4)).toBe('warn');
    expect(pipLevel(2, 4)).toBe('warn');
    expect(pipLevel(1, 4)).toBe('low');
  });
  it('2 pip minion: full ok, 1 low', () => {
    expect(pipLevel(2, 2)).toBe('ok');
    expect(pipLevel(1, 2)).toBe('low');
  });
});

describe('EncounterPanel', () => {
  it('renders nothing without an encounter', () => {
    const { container } = render(<EncounterPanel encounter={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows each enemy with its remaining pips', () => {
    const encounter: Encounter = { enemies: [enemy({ pip: 1 }), enemy({ name: 'ราชา', tier: 'boss', pip: 8, maxPip: 10 })] };
    const { container } = render(<EncounterPanel encounter={encounter} />);
    expect(screen.getByLabelText('ศัตรู')).toBeInTheDocument();
    expect(screen.getByLabelText('หมาป่า เหลือ 1 จาก 4')).toBeInTheDocument();
    expect(screen.getByLabelText('ราชา เหลือ 8 จาก 10')).toBeInTheDocument();
    const boss = screen.getByText('ราชา').closest('li')!;
    expect(boss.querySelectorAll('.pip.on')).toHaveLength(8);
    expect(boss.querySelectorAll('.pip')).toHaveLength(10);
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
