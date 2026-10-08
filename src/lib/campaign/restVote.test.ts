import { describe, it, expect } from 'vitest';
import { normalizeRestVote, proposeRest, agreeRest, cancelRest, RestVoteError } from './restVote';

const ids = ['a', 'b', 'c'];

describe('normalizeRestVote', () => {
  it('accepts a well formed vote for the current round', () => {
    const raw = { kind: 'short', proposerId: 'a', agree: ['a', 'a', 'b'], roundId: 'r1', status: 'open' };
    expect(normalizeRestVote(raw, 'r1')).toEqual({ kind: 'short', proposerId: 'a', agree: ['a', 'b'], roundId: 'r1', status: 'open' });
  });
  it('expires when the round changed, and rejects junk', () => {
    const raw = { kind: 'long', proposerId: 'a', agree: ['a'], roundId: 'r1', status: 'passed' };
    expect(normalizeRestVote(raw, 'r2')).toBeNull();
    expect(normalizeRestVote(null, 'r1')).toBeNull();
    expect(normalizeRestVote({ ...raw, kind: 'nap' }, 'r1')).toBeNull();
    expect(normalizeRestVote({ ...raw, agree: 'a' }, 'r1')).toBeNull();
    expect(normalizeRestVote({ ...raw, status: 'x' }, 'r1')).toBeNull();
  });
});

describe('proposeRest', () => {
  const base = { kind: 'short' as const, proposerId: 'a', roundId: 'r1', activeIds: ids, encounterActive: false };

  it('proposer counts as agreeing; one of three is not enough', () => {
    expect(proposeRest(null, base)).toEqual({ kind: 'short', proposerId: 'a', agree: ['a'], roundId: 'r1', status: 'open' });
  });
  it('passes immediately when the proposer is more than half (solo room)', () => {
    expect(proposeRest(null, { ...base, kind: 'long', activeIds: ['a'] }).status).toBe('passed');
  });
  it('refuses during an encounter, when a vote exists, by a non-active player, or without a round', () => {
    expect(() => proposeRest(null, { ...base, encounterActive: true })).toThrow(expect.objectContaining({ code: 'in_encounter', status: 409 }));
    const open = proposeRest(null, base);
    expect(() => proposeRest(open, base)).toThrow(expect.objectContaining({ code: 'vote_exists', status: 409 }));
    expect(() => proposeRest(null, { ...base, proposerId: 'z' })).toThrow(expect.objectContaining({ code: 'not_active', status: 403 }));
    expect(() => proposeRest(null, { ...base, roundId: null })).toThrow(expect.objectContaining({ code: 'no_round', status: 409 }));
  });
  it('refuses a short rest when nobody has short rests left', () => {
    expect(() => proposeRest(null, { ...base, anyShortRestLeft: false })).toThrow(expect.objectContaining({ code: 'no_short_rests_left' }));
    expect(proposeRest(null, { ...base, kind: 'long', anyShortRestLeft: false }).kind).toBe('long');
  });
});

describe('agreeRest', () => {
  const open = { kind: 'short' as const, proposerId: 'a', agree: ['a'], roundId: 'r1', status: 'open' as const };
  const ok = { activeIds: ids, encounterActive: false };

  it('passes once strictly more than half of active players agree', () => {
    const v = agreeRest(open, { playerId: 'b', ...ok });
    expect(v.agree).toEqual(['a', 'b']);
    expect(v.status).toBe('passed');
  });
  it('four players need three', () => {
    const four = ['a', 'b', 'c', 'd'];
    const v = agreeRest(open, { playerId: 'b', activeIds: four, encounterActive: false });
    expect(v.status).toBe('open');
    expect(agreeRest(v, { playerId: 'c', activeIds: four, encounterActive: false }).status).toBe('passed');
  });
  it('ignores votes from players no longer able to play when counting', () => {
    const v = { ...open, agree: ['a', 'gone'] };
    expect(agreeRest(v, { playerId: 'a', ...ok }).status).toBe('open');
  });
  it('is idempotent, and refuses missing vote, inactive voter, encounter', () => {
    expect(agreeRest(open, { playerId: 'a', ...ok }).agree).toEqual(['a']);
    expect(() => agreeRest(null, { playerId: 'b', ...ok })).toThrow(expect.objectContaining({ code: 'no_vote', status: 409 }));
    expect(() => agreeRest(open, { playerId: 'z', ...ok })).toThrow(expect.objectContaining({ code: 'not_active', status: 403 }));
    expect(() => agreeRest(open, { playerId: 'b', activeIds: ids, encounterActive: true })).toThrow(expect.objectContaining({ code: 'in_encounter' }));
  });
  it('a passed vote stays passed', () => {
    const passed = { ...open, agree: ['a', 'b'], status: 'passed' as const };
    expect(agreeRest(passed, { playerId: 'c', ...ok }).status).toBe('passed');
  });
});

describe('cancelRest', () => {
  const open = { kind: 'long' as const, proposerId: 'a', agree: ['a'], roundId: 'r1', status: 'open' as const };
  it('proposer or room owner may cancel', () => {
    expect(cancelRest(open, { playerId: 'a', ownerId: 'b' })).toBeNull();
    expect(cancelRest(open, { playerId: 'b', ownerId: 'b' })).toBeNull();
  });
  it('others may not; nothing to cancel is 409', () => {
    expect(() => cancelRest(open, { playerId: 'c', ownerId: 'b' })).toThrow(expect.objectContaining({ code: 'forbidden', status: 403 }));
    expect(() => cancelRest(null, { playerId: 'a', ownerId: 'b' })).toThrow(RestVoteError);
  });
});
