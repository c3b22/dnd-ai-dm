const SANCTUARIES: Record<string, string> = {
  'sunken-bell-of-marrowmere': "Brother Tolliver's empty chapel on the lakeshore",
  'the-wolf-king-of-ashenfell': "the hearth in Jarl Asgrim's longhall",
  'the-thousand-doors-market':
    "Ozric the Lantern-Seller's stall (narrate the healing as costing a small story favor, never a number)",
  'crown-of-the-sunken-king':
    'the tavern near Castle Dunmoor where the map was bought (leaving the dungeon to rest)',
};

/** Where the party may be fully restored in this adventure; the DM may tag `[[sanctuary]]` only there. */
export function sanctuaryFor(adventureId: string | null | undefined): string | undefined {
  return adventureId && Object.prototype.hasOwnProperty.call(SANCTUARIES, adventureId)
    ? SANCTUARIES[adventureId]
    : undefined;
}
