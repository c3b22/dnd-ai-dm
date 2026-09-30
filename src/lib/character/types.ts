export type CharacterStatus = 'active' | 'downed';

export interface Character {
  id: string;
  displayName: string;
  weaponId: string | null;
  hp: number;
  maxHp: number;
  status: CharacterStatus;
  revivesSinceSanctuary: number;
  /** Flat damage the equipped armor absorbs from each hit; absent means none. */
  armorReduction?: number;
}
