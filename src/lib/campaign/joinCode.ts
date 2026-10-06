// Excludes 0/O, 1/I/L: characters players commonly confuse when reading a code aloud or off a screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export function generateJoinCode(length: number = LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
