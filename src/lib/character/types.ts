export type CharacterStatus = 'active' | 'downed';

export interface Character {
  id: string;
  displayName: string;
  weaponId: string | null;
  hp: number;
  maxHp: number;
  status: CharacterStatus;
  revivesSinceSanctuary: number;
}
