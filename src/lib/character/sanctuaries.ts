const SANCTUARIES: Record<string, string> = {
  'sunken-bell-of-marrowmere': "Brother Tolliver's empty chapel on the lakeshore",
  'the-wolf-king-of-ashenfell': "the hearth in Jarl Asgrim's longhall",
  'the-thousand-doors-market':
    "Ozric the Lantern-Seller's stall (narrate the healing as costing a small story favor, never a number)",
  'crown-of-the-sunken-king':
    'the tavern near Castle Dunmoor where the map was bought (leaving the dungeon to rest)',
  'the-clockwork-orphan':
    "Tilly Brasscog's cramped repair room above the guild clerks' office, warm with oil lamps and kept off the guild's books",
  'the-starving-god-of-red-dunes':
    "Rashida the Wayfinder's hidden oasis camp beyond the edge of the dunes, away from the elders' tribute road",
  'the-mask-collector-of-gallowsreach':
    "Pock's bolted back-room workshop in the under-city, with every mask turned to face the wall",
  'the-toad-kings-hoard':
    'the lakeshore camp above Lake Mirrow where the diving crews dry out (leaving the sunken castle to rest)',
  'the-three-vaults-of-the-starfall-crown':
    "the roadside waystation between the ruins where Mira Quill keeps her notes (leaving the vault to rest)",
};

/** Where the party may be fully restored in this adventure; the DM may tag `[[sanctuary]]` only there. */
export function sanctuaryFor(adventureId: string | null | undefined): string | undefined {
  return adventureId && Object.prototype.hasOwnProperty.call(SANCTUARIES, adventureId)
    ? SANCTUARIES[adventureId]
    : undefined;
}
