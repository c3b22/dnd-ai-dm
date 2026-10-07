'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from '@/lib/prefersReducedMotion';
import { skillLabel } from '@/lib/character/skillLabels';

/** One skill check shown to the whole table once the dice land. */
export interface DiceCheckView {
  playerDisplayName: string;
  skill: string;
  dc: number;
  die: number;
  modifier: number;
  proficiency: number;
  total: number;
  success: boolean;
}

/** I2: one enemy attack on a player: the enemy's d20 plus its bonus against the player's armor class. */
export interface DiceEnemyAttackView {
  enemy: string;
  target: string;
  die: number;
  bonus: number;
  total: number;
  ac: number;
  hit: boolean;
  critical: 'success' | 'failure' | null;
}

/** "12 + 4 = 16" : the enemy's d20, its attack bonus, total. */
export function enemyAttackFormula(a: Pick<DiceEnemyAttackView, 'die' | 'bonus' | 'total'>): string {
  return `${a.die} ${a.bonus < 0 ? '-' : '+'} ${Math.abs(a.bonus)} = ${a.total}`;
}

/** "12 + 2 + 2 = 16" : d20, ability modifier, proficiency (when proficient), total. */
export function checkFormula(c: Pick<DiceCheckView, 'die' | 'modifier' | 'proficiency' | 'total'>): string {
  const part = (n: number) => ` ${n < 0 ? '-' : '+'} ${Math.abs(n)}`;
  return `${c.die}${part(c.modifier)}${c.proficiency ? part(c.proficiency) : ''} = ${c.total}`;
}

export interface DiceRollOverlayProps {
  values: number[];
  /** Skill checks among the rolls, if any; shown with the result once the dice settle. */
  checks?: DiceCheckView[];
  /** Enemy attacks among the rolls (I2), shown as "enemy -> player, total vs AC". */
  enemyAttacks?: DiceEnemyAttackView[];
  onComplete: () => void;
}

// Let the result sit on screen for a beat before the overlay clears.
const SETTLE_PAUSE_MS = 900;
// A normal roll takes a few seconds. If the render loop stalls (background tab, GPU stall,
// lost WebGL context) the dice never report they settled, and the DM's reply is held back
// until this overlay completes, so give up and reveal everything instead of hanging the table.
const MAX_ROLL_MS = 10_000;

export function DiceRollOverlay({ values, checks, enemyAttacks, onComplete }: DiceRollOverlayProps) {
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let diceBox: { clear?: () => void } | null = null;

    function finish() {
      if (doneRef.current || cancelled) return;
      doneRef.current = true;
      onCompleteRef.current();
    }

    if (prefersReducedMotion() || values.length === 0) {
      finish();
      return () => {
        cancelled = true;
      };
    }

    const failsafeId = setTimeout(finish, MAX_ROLL_MS);

    (async () => {
      try {
        const { default: DiceBox } = await import('@3d-dice/dice-box');
        if (cancelled) return;
        const box = new DiceBox({
          container: '#dice-roll-overlay-box',
          assetPath: '/assets/',
          themeColor: '#d7263d',
          scale: 10,
        });
        diceBox = box;
        await box.init();
        if (cancelled) return;
        box.onRollComplete = () => {
          if (cancelled) return;
          setLanded(true);
          setTimeout(finish, SETTLE_PAUSE_MS);
        };
        box.roll(`${values.length}d20@${values.join(',')}`);
      } catch {
        // No WebGL, a blocked asset load, or any other 3D failure: skip straight
        // to the plain pill in the log instead of leaving the table stuck.
        finish();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(failsafeId);
      try {
        diceBox?.clear?.();
      } catch {
        /* best-effort cleanup */
      }
    };
    // This batch of values rolls exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === 'undefined') return null;

  // Mounted straight onto <body>: the game screen has ancestors with overflow
  // and transform rules that would otherwise clip or reposition a fixed overlay.
  return createPortal(
    <div className="dice-overlay" role="presentation">
      <div
        id="dice-roll-overlay-box"
        className={`dice-overlay-box${landed ? ' landed' : ''}`}
      />
      {landed && (
        <div className="dice-result" aria-live="polite">
          {values.join(', ')}
          {((checks && checks.length > 0) || (enemyAttacks && enemyAttacks.length > 0)) && (
            <ul className="dice-checks">
              {(checks ?? []).map((c, i) => (
                <li key={i} className={`dice-check ${c.success ? 'pass' : 'fail'}`}>
                  <strong>{c.playerDisplayName}</strong> · {skillLabel(c.skill)} DC {c.dc} · {checkFormula(c)} ·{' '}
                  {c.success ? 'ผ่าน' : 'ไม่ผ่าน'}
                </li>
              ))}
              {(enemyAttacks ?? []).map((a, i) => (
                <li key={`enemy-${i}`} className={`dice-check ${a.hit ? 'fail' : 'pass'}`}>
                  <strong>{a.enemy}</strong> → {a.target} · {enemyAttackFormula(a)} เทียบ AC {a.ac} ·{' '}
                  {a.hit ? (a.critical === 'success' ? 'โดน (คริติคอล)' : 'โดน') : 'พลาด'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
