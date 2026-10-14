import { describe, expect, it } from 'vitest';
import { channelTopic } from './channelTopic';

describe('channelTopic', () => {
  it('keeps the readable base name', () => {
    expect(channelTopic('players:c1')).toMatch(/^players:c1:/);
  });

  it('gives every subscription its own topic so a re-subscribe never reuses a channel that is still closing', () => {
    expect(channelTopic('players:c1')).not.toBe(channelTopic('players:c1'));
  });
});
