export class EconomyError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 409 = 409
  ) {
    super(code);
  }
}

/**
 * Postgres check_violation on the players.gold >= 0 constraint specifically (Postgres' default
 * name for an inline column check is `<table>_<column>_check`), not any other check constraint
 * that happens to raise the same 23514 code (for example inventory_items.quantity > 0).
 */
export const isGoldViolation = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === '23514' && /players_gold_check/.test(error?.message ?? '');

/**
 * apply_changes' own raised error when a player's items no longer match what the caller
 * read before computing the new list — someone else's write landed first. The caller should
 * surface this as a conflict rather than applying a now-stale item list.
 */
export const isInventoryConflict = (error: { code?: string } | null): boolean => error?.code === 'EC001';
