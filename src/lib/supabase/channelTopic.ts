let next = 0;

/**
 * Realtime topic for one subscription. supabase-js hands back the existing channel when a topic is
 * already registered, and removeChannel finishes asynchronously, so an effect that re-subscribes
 * with the same name gets the old, already-subscribed channel and `.on()` throws. A per-call suffix
 * keeps every subscription on its own channel.
 */
export function channelTopic(base: string): string {
  next += 1;
  return `${base}:${next}`;
}
