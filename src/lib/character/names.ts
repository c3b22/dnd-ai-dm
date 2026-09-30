/** Unknown or ambiguous names resolve to null so a bad tag can never hit the wrong player. */
export function findByDisplayName<T extends { displayName: string }>(list: T[], name: string): T | null {
  const wanted = name.trim().toLowerCase();
  const matches = list.filter((c) => c.displayName.trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0] : null;
}
