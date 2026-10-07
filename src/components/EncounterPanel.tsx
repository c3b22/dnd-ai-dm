'use client';

import { useState } from 'react';
import { ENEMY_TRAIT_LABELS } from '@/lib/combat/constants';
import type { Encounter } from '@/lib/combat/encounter';

export const COLLAPSE_AFTER = 4;

export type PipLevel = 'ok' | 'warn' | 'low';

/** Full = ok, last pip (when there is more than one) = low, anything between = warn. */
export function pipLevel(pip: number, maxPip: number): PipLevel {
  if (pip >= maxPip) return 'ok';
  if (pip <= 1 && maxPip > 1) return 'low';
  return 'warn';
}

export function EncounterPanel({ encounter }: { encounter: Encounter | null }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!encounter) return null;
  const { enemies } = encounter;
  const collapsible = enemies.length > COLLAPSE_AFTER;

  return (
    <section className="card enc" aria-label="ศัตรู">
      <div className="enc-head">
        <h3>ศัตรู</h3>
        {collapsible && (
          <button
            type="button"
            className="enc-toggle"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? 'ขยายรายการศัตรู' : 'ย่อรายการศัตรู'}
          </button>
        )}
      </div>
      <ul className={`enc-list${collapsible && collapsed ? ' collapsed' : ''}`}>
        {enemies.map((enemy) => {
          const dead = enemy.pip <= 0 && !enemy.fled;
          const level = pipLevel(enemy.pip, enemy.maxPip);
          return (
            <li key={enemy.name} className={`enc-row${dead ? ' is-dead' : ''}${enemy.fled ? ' is-fled' : ''}`}>
              <span className="nm">{enemy.name}</span>
              {enemy.fled && <b className="badge-fled">หนี</b>}
              {enemy.traits && enemy.traits.length > 0 && (
                <ul className="enc-traits" aria-label={`นิสัยของ ${enemy.name}`}>
                  {enemy.traits.map((trait) => (
                    <li key={trait} className="badge-trait">{ENEMY_TRAIT_LABELS[trait]}</li>
                  ))}
                </ul>
              )}
              <div
                className={`hp-track pips ${level}`}
                role="img"
                aria-label={`${enemy.name} เหลือ ${enemy.pip} จาก ${enemy.maxPip}`}
              >
                {Array.from({ length: enemy.maxPip }, (_, i) => (
                  <i key={i} className={`pip${i < enemy.pip ? ' on' : ''}`} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
