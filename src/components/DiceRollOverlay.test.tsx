import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { DiceRollOverlay } from './DiceRollOverlay';

const { DiceBoxMock, initMock } = vi.hoisted(() => {
  const initMock = vi.fn();
  const DiceBoxMock = vi.fn().mockImplementation(() => ({ init: initMock }));
  return { DiceBoxMock, initMock };
});

vi.mock('@3d-dice/dice-box', () => ({ default: DiceBoxMock }));

describe('DiceRollOverlay', () => {
  beforeEach(() => {
    DiceBoxMock.mockClear();
    initMock.mockReset();
  });

  it('completes immediately without loading the dice library when reduced motion is preferred', async () => {
    const original = window.matchMedia;
    (window as any).matchMedia = () => ({ matches: true });
    const onComplete = vi.fn();

    render(<DiceRollOverlay values={[15, 7]} onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(DiceBoxMock).not.toHaveBeenCalled();

    window.matchMedia = original;
  });

  it('falls back to completing when the dice library fails to initialize (e.g. no WebGL)', async () => {
    initMock.mockRejectedValue(new Error('WebGL unavailable'));
    const onComplete = vi.fn();

    render(<DiceRollOverlay values={[15, 7]} onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('rolls the given values as d20 notation once the box initializes', async () => {
    initMock.mockResolvedValue(undefined);
    const rollMock = vi.fn();
    DiceBoxMock.mockImplementation(() => ({ init: initMock, roll: rollMock }));

    render(<DiceRollOverlay values={[15, 7]} onComplete={vi.fn()} />);

    await waitFor(() => expect(rollMock).toHaveBeenCalledWith('2d20@15,7'));
  });

  it('constructs the box with the container, assetPath, and a big red theme', async () => {
    initMock.mockResolvedValue(undefined);

    render(<DiceRollOverlay values={[15, 7]} onComplete={vi.fn()} />);

    await waitFor(() => expect(DiceBoxMock).toHaveBeenCalledTimes(1));
    expect(DiceBoxMock).toHaveBeenCalledWith({
      container: '#dice-roll-overlay-box',
      assetPath: '/assets/',
      themeColor: '#d7263d',
      scale: 10,
    });
  });

  it('shows the rolled numbers as text once the dice land, before completing', async () => {
    vi.useFakeTimers();
    initMock.mockResolvedValue(undefined);
    let triggerRollComplete: () => void = () => {};
    DiceBoxMock.mockImplementation(() => ({
      init: initMock,
      roll: vi.fn(),
      set onRollComplete(cb: () => void) {
        triggerRollComplete = cb;
      },
    }));
    const onComplete = vi.fn();

    render(<DiceRollOverlay values={[15, 7]} onComplete={onComplete} />);

    // Let the init microtask chain resolve so onRollComplete is wired up.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      triggerRollComplete();
    });

    expect(screen.getByText('15, 7')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    // The physics engine can't be forced to the real result, so the moment it
    // lands the canvas is hidden before anyone can read its (possibly wrong) face.
    expect(document.getElementById('dice-roll-overlay-box')).toHaveClass('landed');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
