/** Pulls a share code out of what a user pasted: a bare code or a full share link.
 * Returns null when nothing code-like is found. */
export function extractShareCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withoutQuery = trimmed.split(/[?#]/)[0].replace(/\/+$/, '');
  const tail = withoutQuery.split('/').pop() ?? '';
  if (!/^[A-Za-z0-9]+$/.test(tail)) return null;
  return tail.toUpperCase();
}
