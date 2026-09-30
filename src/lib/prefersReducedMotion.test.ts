import { describe, it, expect } from 'vitest';
import { prefersReducedMotion } from './prefersReducedMotion';

describe('prefersReducedMotion', () => {
  it('reflects the media query when matchMedia is available', () => {
    const original = window.matchMedia;
    (window as any).matchMedia = () => ({ matches: true });

    expect(prefersReducedMotion()).toBe(true);

    window.matchMedia = original;
  });

  it('defaults to false when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    // @ts-expect-error simulating an environment without matchMedia
    delete window.matchMedia;

    expect(prefersReducedMotion()).toBe(false);

    window.matchMedia = original;
  });
});
