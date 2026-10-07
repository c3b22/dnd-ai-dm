'use client';

import { useState } from 'react';
import type { RoundPlayer } from '@/lib/supabase/players';
import { weaponFor } from '@/lib/character/constants';
import { HpBar } from './HpBar';
import { AbilityChoice } from './AbilityChoice';
import type { AbilityChoice as Choice } from '@/lib/character/leveling';
import { catalogEntry } from '@/lib/inventory/catalog';
import { equippedArmorId, equippedWeaponId } from '@/lib/inventory/rules';

export interface PlayerOrderProps {
  players: RoundPlayer[];
  currentPlayerId: string;
  /** True once the current player has submitted: the order is then locked for this round. */
  locked: boolean;
  onMove: (playerId: string, direction: -1 | 1) => void;
  /** Drop the dragged player into the place of another one. */
  onReorder?: (draggedId: string, targetId: string) => void;
  /** Table rule: 'owner' means only the owner arranges the order. */
  reorderPolicy?: 'owner' | 'self';
  /** Spend an unspent ability score improvement; the badge shows only on the current player's own row. */
  onAbilityChoice?: (choice: Choice) => Promise<void>;
}

const AVATAR_COLORS = ['#e0a94a', '#5fb3a5', '#d46a5a', '#8a7fd6', '#6fa8dc'];

export function PlayerOrder({ players, currentPlayerId, locked, onMove, onReorder, reorderPolicy = 'self', onAbilityChoice }: PlayerOrderProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const currentIsOwner = players.find((p) => p.id === currentPlayerId)?.isOwner ?? false;
  // The owner arranges everyone; other players only move themselves.
  const canMove = (playerId: string) =>
    !locked && (currentIsOwner || (reorderPolicy === 'self' && playerId === currentPlayerId));
  const actedCount = players.filter((p) => p.acted).length;
  const progress = players.length ? (actedCount / players.length) * 100 : 0;

  return (
    <section className="card" aria-label="ลำดับการออก action">
      <h3>ผู้เล่นรอบนี้</h3>
      <ol className="pl-list">
        {players.map((player, index) => (
          <li
            key={player.id}
            className={`pl-row${player.acted ? ' done' : ''}${player.status === 'downed' ? ' is-down' : ''}${dragId === player.id ? ' dragging' : ''}${overId === player.id ? ' drag-over' : ''}`}
            draggable={canMove(player.id) && !!onReorder}
            onDragStart={() => setDragId(player.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              if (dragId && dragId !== player.id) {
                e.preventDefault();
                setOverId(player.id);
              }
            }}
            onDragLeave={() => setOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== player.id) onReorder?.(dragId, player.id);
              setDragId(null);
              setOverId(null);
            }}
          >
            <span className="ord" title={`ออก action เป็นลำดับที่ ${index + 1}`}>
              {index + 1}
            </span>
            <span
              className={`av${player.status === 'downed' ? ' down' : ''}`}
              aria-hidden="true"
              style={{ background: `${AVATAR_COLORS[index % AVATAR_COLORS.length]}33` }}
            >
              {player.status === 'downed' ? '✕' : player.displayName.charAt(0)}
            </span>
            <span className="who">
              <span className="nm">
                {player.displayName}
                {player.id === currentPlayerId ? ' (คุณ)' : ''}
              </span>
              <span className="st" style={{ display: 'block' }}>
                {player.status === 'downed' ? (
                  <b className="badge-down">ล้มลง</b>
                ) : (
                  <span>{player.acted ? 'ส่งแล้ว' : 'กำลังคิด…'}</span>
                )}
                <span className="wpn">
                  {' '}
                  · {weaponFor(equippedWeaponId(player.items)).nameTh}
                  {equippedArmorId(player.items) ? ` · ${catalogEntry(equippedArmorId(player.items)!)?.nameTh}` : ''}
                  {' '}· {player.gold} ทอง
                </span>
              </span>
              <HpBar hp={player.hp} maxHp={player.maxHp} xp={player.xp} />
              {player.id === currentPlayerId && onAbilityChoice && player.abilities && (
                <AbilityChoice
                  abilities={player.abilities}
                  remaining={player.abilityChoicesLeft ?? 0}
                  onConfirm={onAbilityChoice}
                />
              )}
            </span>
            <span className="mv">
              <button
                type="button"
                aria-label={`เลื่อน ${player.displayName} ขึ้น`}
                disabled={!canMove(player.id) || index === 0}
                onClick={() => onMove(player.id, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`เลื่อน ${player.displayName} ลง`}
                disabled={!canMove(player.id) || index === players.length - 1}
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
        ลำดับนี้คือลำดับที่ DM ตัดสิน action ในรอบนี้ คนหลังต่อยอดจากผลของคนก่อนได้{' '}
        {currentIsOwner
          ? 'คุณเป็นเจ้าของโต๊ะ จัดลำดับทุกคนได้'
          : reorderPolicy === 'self'
            ? 'คุณเลื่อนได้เฉพาะลำดับของตัวเอง'
            : 'โต๊ะนี้ให้เจ้าของโต๊ะเป็นคนจัดลำดับ'}
      </p>
    </section>
  );
}
