// I5: generates the markdown tables of docs/combat-balance.md. Skipped in normal runs; run it with
//   SIM_REPORT=<output file> npx vitest run src/lib/combat/simulate.report.test.ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildParty, simulateMany, STANDARD_FIGHTS, type ArmorProfile } from './simulate';

const FIGHTS = 1000;
const LEVELS = [1, 3, 5, 8];
const LABELS: Record<keyof typeof STANDARD_FIGHTS, string> = {
  minion4: 'minion x4',
  normal2: 'normal x2',
  strongNormal: 'strong + normal',
  boss: 'boss x1',
  normal2PackBrute: 'normal x2 (pack, brute)',
  bossTraits: 'boss x1 (armored, boss_signature)',
};
const PROFILES: { id: ArmorProfile; label: string }[] = [
  { id: 'none', label: 'ไม่มีเกราะ (ชุดเริ่มต้น)' },
  { id: 'class', label: 'เกราะประจำ class (นักรบหนัก, นักบวชกลาง, นักธนู/โจรเบา)' },
];

describe.skipIf(!process.env.SIM_REPORT)('combat balance report', () => {
  it('writes the 1,000-fight tables', () => {
    const out: string[] = [];
    for (const p of PROFILES) {
      out.push(`### ${p.label}`, '', '| ศัตรู | เลเวล | ชนะ % | รอบเฉลี่ย | รอบเฉลี่ย (เฉพาะที่ชนะ) | HP ปาร์ตี้ที่เหลือ % | คนล้มเฉลี่ย (จาก 4) |', '|---|---|---|---|---|---|---|');
      for (const key of Object.keys(STANDARD_FIGHTS) as (keyof typeof STANDARD_FIGHTS)[]) {
        for (const level of LEVELS) {
          const s = simulateMany(buildParty(level, p.id), STANDARD_FIGHTS[key], FIGHTS, 1000 + level * 7919);
          out.push(`| ${LABELS[key]} | ${level} | ${(s.winRate * 100).toFixed(1)} | ${s.avgRounds.toFixed(2)} | ${s.avgRoundsWon.toFixed(2)} | ${(s.avgHpFraction * 100).toFixed(1)} | ${s.avgDowned.toFixed(2)} |`);
        }
      }
      out.push('');
    }
    writeFileSync(process.env.SIM_REPORT as string, out.join('\n'));
    expect(out.length).toBeGreaterThan(0);
  });
});
