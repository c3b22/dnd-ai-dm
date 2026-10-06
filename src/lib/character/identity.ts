/** Max length of each character identity text field (backstory, personality, goal). */
export const IDENTITY_FIELD_MAX = 500;

export const IDENTITY_FIELDS = ['backstory', 'personality', 'goal'] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
export type IdentityFields = Partial<Record<IdentityField, string | null>>;

/**
 * Normalizes identity fields from untrusted input: trims, maps empty / non-string
 * to null, caps at IDENTITY_FIELD_MAX. Keys that are undefined are omitted so a
 * partial update does not overwrite fields it did not send.
 */
export function normalizeIdentityFields(input: unknown): IdentityFields {
  const out: IdentityFields = {};
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  for (const key of IDENTITY_FIELDS) {
    const v = src[key];
    if (v === undefined) continue;
    if (typeof v !== 'string') {
      out[key] = null;
      continue;
    }
    const trimmed = v.trim().slice(0, IDENTITY_FIELD_MAX).trim();
    out[key] = trimmed === '' ? null : trimmed;
  }
  return out;
}
