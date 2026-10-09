import { describe, expect, it } from 'vitest';
import { GEMINI_MODELS, realGeminiDeps } from './vercelAiSdkAdapter';

describe('GEMINI_MODELS', () => {
  it('has a non-lite narrationPremium model distinct from the lite chain', () => {
    expect(GEMINI_MODELS.narrationPremium).toBe('gemini-3.5-flash');
    expect(GEMINI_MODELS.narrationPremium).not.toMatch(/lite/);
    expect([GEMINI_MODELS.primary, GEMINI_MODELS.fallback]).not.toContain(GEMINI_MODELS.narrationPremium);
  });
});

describe('realGeminiDeps', () => {
  it('wires the premium model next to the lite chain', () => {
    expect(realGeminiDeps.premiumModel).toBe(GEMINI_MODELS.narrationPremium);
    expect(realGeminiDeps.primaryModel).toBe(GEMINI_MODELS.primary);
    expect(realGeminiDeps.fallbackModel).toBe(GEMINI_MODELS.fallback);
  });
});
