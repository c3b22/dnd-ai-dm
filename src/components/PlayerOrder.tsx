'use client';

import type { RoundPlayer } from '@/lib/supabase/players';

export interface PlayerOrderProps {
  players: RoundPlayer[];
  currentPlayerId: string;
  /** True once the current player has submitted: the order is then locked for this round. */
  locked: boolean;
  onMove: (playerId: string, direction: -1 | 1) => void;
}

const AVATAR_COLORS = ['#e0a94a', '#5fb3a5', '#d46a5a', '#8a7fd6', '#6fa8dc'];

export function PlayerOrder({ players, currentPlayerId, locked, onMove }: PlayerOrderProps) {
  const actedCount = players.filter((p) => p.acted).length;
  const progress = players.length ? (actedCount / players.length) * 100 : 0;

  return (
    <section className="card" aria-label="ลำดับการออก action">
      <h3>ผู้เล่นรอบนี้</h3>
      <ol className="pl-list">
        {players.map((player, index) => (
          <li key={player.id} className={`pl-row${player.acted ? ' done' : ''}`}>
            <span className="ord" title={`ออก action เป็นลำดับที่ ${index + 1}`}>
              {index + 1}
            </span>
            <span
              className="av"
              aria-hidden="true"
              style={{ background: `${AVATAR_COLORS[index % AVATAR_COLORS.length]}33` }}
            >
              {player.displayName.charAt(0)}
            </span>
            <span className="who">
              <span className="nm">
                {player.displayName}
                {player.id === currentPlayerId ? ' (คุณ)' : ''}
              </span>
              <span className="st" style={{ display: 'block' }}>
                {player.acted ? 'ส่งแล้ว' : 'กำลังคิด…'}
              </span>
            </span>
            <span className="mv">
              <button
                type="button"
                aria-label={`เลื่อน ${player.displayName} ขึ้น`}
                disabled={locked || index === 0}
                onClick={() => onMove(player.id, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`เลื่อน ${player.displayName} ลง`}
                disabled={locked || index === players.length - 1}
                onClick={() => onMove(player.id, 1)}
              >
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
      <p className="status" aria-live="polite">
        {actedCount} / {players.length} players have acted this round
      </p>
      <p className="order-hint">
        ลำดับนี้คือลำดับที่ DM ตัดสิน action ในรอบนี้ คนหลังต่อยอดจากผลของคนก่อนได้
      </p>
    </section>
  );
}
