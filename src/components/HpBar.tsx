import { BASE_MAX_HP } from '@/lib/character/constants';

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const lost = BASE_MAX_HP - maxHp;
  const pct = (n: number) => `${(n / BASE_MAX_HP) * 100}%`;
  const low = maxHp > 0 && hp / maxHp <= 0.3;
  return (
    <div className="hp" aria-label={`HP ${hp} จาก ${maxHp}`}>
      <div className="hp-track">
        <i className={`hp-fill${low ? ' low' : ''}`} style={{ width: pct(hp) }} />
        {lost > 0 && <i className="hp-lost" style={{ width: pct(lost) }} title={`max HP ลดลง ${lost}`} />}
      </div>
      <span className="hp-num">
        {hp}/{maxHp}
        {lost > 0 && <em> (max −{lost})</em>}
      </span>
    </div>
  );
}
