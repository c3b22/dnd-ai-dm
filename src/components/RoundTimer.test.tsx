import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundTimer, formatRemaining } from './RoundTimer';

describe('formatRemaining', () => {
  it('formats minutes and seconds and never goes below zero', () => {
    expect(formatRemaining(272_000)).toBe('04:32');
    expect(formatRemaining(500)).toBe('00:01');
    expect(formatRemaining(-5000)).toBe('00:00');
  });
});

describe('RoundTimer', () => {
  const openedAt = '2026-01-01T00:00:00.000Z';
  const start = new Date(openedAt).getTime();

  it('counts down from when the round opened', () => {
    render(
      <RoundTimer openedAt={openedAt} durationMs={300_000} paused={false} onExpire={() => {}} now={() => start + 28_000} />
    );
    expect(screen.getByRole('timer').textContent).toBe('04:32');
  });

  it('calls onExpire exactly once when time is up', () => {
    const onExpire = vi.fn();
    const { rerender } = render(
      <RoundTimer openedAt={openedAt} durationMs={300_000} paused={false} onExpire={onExpire} now={() => start + 301_000} />
    );
    rerender(
      <RoundTimer openedAt={openedAt} durationMs={300_000} paused onExpire={onExpire} now={() => start + 302_000} />
    );

    expect(screen.getByRole('timer').textContent).toBe('หมดเวลา');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('renders nothing before the round start time is known', () => {
    const { container } = render(
      <RoundTimer openedAt={null} durationMs={300_000} paused={false} onExpire={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});
