'use client';

import type { RoundPlayer } from '@/lib/supabase/players';

export interface PlayerOrderProps {
  players: RoundPlayer[];
  currentPlayerId: string;
  /** True once the current player has submitted: the order is then locked for this round. */
  locked: boolean;
  onMove: (playerId: string, direction: -1 | 1) => void;
}

export function PlayerOrder({ players, currentPlayerId, locked, onMove }: PlayerOrderProps) {
  const actedCount = players.filter((p) => p.acted).length;

  return (
    <section aria-label="ลำดับการออก action">
      <p>
        {actedCount} / {players.length} players have acted this round
      </p>
      <ol style={{ paddingLeft: 24 }}>
        {players.map((player, index) => (
          <li key={player.id} style={{ margin: '4px 0' }}>
            <span>
              {player.displayName}
              {player.id === currentPlayerId ? ' (คุณ)' : ''} — {player.acted ? 'ส่งแล้ว' : 'กำลังคิด…'}
            </span>{' '}
            <button
              type="button"
              aria-label={`เลื่อน ${player.displayName} ขึ้น`}
              disabled={locked || index === 0}
              onClick={() => onMove(player.id, -1)}
            >
              ▲
            </button>{' '}
            <button
              type="button"
              aria-label={`เลื่อน ${player.displayName} ลง`}
              disabled={locked || index === players.length - 1}
              onClick={() => onMove(player.id, 1)}
            >
              ▼
            </button>
          </li>
        ))}
      </ol>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        ลำดับนี้คือลำดับที่ DM ตัดสิน action ในรอบนี้ คนหลังต่อยอดจากผลของคนก่อนได้
      </p>
    </section>
  );
}
