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
  /** Personal gold; absent means 0. */
  gold?: number;
  /** Experience points; absent means 0. Level is always derived from this. */
  xp?: number;
}
