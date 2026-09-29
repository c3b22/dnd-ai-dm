import { describe, it, expect } from 'vitest';
import { generateJoinCode } from './joinCode';

describe('generateJoinCode', () => {
  it('generates a 6-character code', () => {
    expect(generateJoinCode()).toHaveLength(6);
  });

  it('never uses ambiguous characters (0/O, 1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('is uppercase', () => {
    const code = generateJoinCode();
    expect(code).toBe(code.toUpperCase());
  });
});
