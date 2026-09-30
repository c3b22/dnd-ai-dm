import type { DiceSpec } from './constants';

export function rollDice(spec: DiceSpec, rollDie: (sides: number) => number): number {
  let total = spec.bonus;
  for (let i = 0; i < spec.count; i++) total += rollDie(spec.sides);
  return total;
}

export const randomDie = (sides: number): number => 1 + Math.floor(Math.random() * sides);
