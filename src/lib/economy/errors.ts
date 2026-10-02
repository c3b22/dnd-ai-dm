export class EconomyError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409 = 409
  ) {
    super(code);
  }
}

/** Postgres check_violation: the players.gold >= 0 constraint refused an overspend. */
export const isGoldViolation = (error: { code?: string } | null): boolean => error?.code === '23514';

/**
 * apply_changes' own raised error when a player's items no longer match what the caller
 * read before computing the new list — someone else's write landed first. The caller should
 * surface this as a conflict rather than applying a now-stale item list.
 */
export const isInventoryConflict = (error: { code?: string } | null): boolean => error?.code === 'EC001';
