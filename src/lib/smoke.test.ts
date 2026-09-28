import { describe, it, expect } from 'vitest';

function add(a: number, b: number) {
  return a + b;
}

describe('smoke test', () => {
  it('confirms the test runner and TypeScript config work', () => {
    expect(add(2, 3)).toBe(5);
  });
});
