import { BASE_MAX_HP } from '@/lib/character/constants';
import { levelForXp, levelHpBonus, xpProgress } from '@/lib/character/leveling';

/** maxHp is the effective value (base plus level bonus); xp is optional and defaults to level 1. */
export function HpBar({ hp, maxHp, xp = 0 }: { hp: number; maxHp: number; xp?: number }) {
  const level = levelForXp(xp);
  const full = BASE_MAX_HP + levelHpBonus(level);
  const lost = full - maxHp;
  const pct = (n: number) => `${(n / full) * 100}%`;
  const low = maxHp > 0 && hp / maxHp <= 0.3;
  const progress = xpProgress(xp);
  return (
    <div className="hp" aria-label={`HP ${hp} จาก ${maxHp}`}>
      <div className="hp-track">
        <i className={`hp-fill${low ? ' low' : ''}`} style={{ width: pct(hp) }} />
        {lost > 0 && <i className="hp-lost" style={{ width: pct(lost) }} title={`max HP ลดลง ${lost}`} />}
      </div>
      <span className="hp-num">
        {hp}/{maxHp}
        {lost > 0 && <em> (max −{lost})</em>}
        <b className="lv">Lv {level}</b>
      </span>
      {progress ? (
        <div className="xp-track" aria-label={`XP ${progress.into} จาก ${progress.span}`}>
          <i className="xp-fill" style={{ width: `${(progress.into / progress.span) * 100}%` }} />
        </div>
      ) : (
        <span className="xp-max">MAX</span>
      )}
    </div>
  );
}
