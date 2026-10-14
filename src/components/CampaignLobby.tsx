'use client';

import { useState } from 'react';
import type { RoundPlayer } from '@/lib/supabase/players';

export interface CampaignLobbyProps {
  campaignName: string;
  adventureTitle?: string;
  adventureTagline?: string;
  /** Opening scene art for the left half; the lobby works without it. */
  coverUrl?: string;
  joinCode: string;
  players: RoundPlayer[];
  currentPlayerId: string;
  isOwner: boolean;
  onStart: () => Promise<void>;
}

export function CampaignLobby({
  campaignName,
  adventureTitle,
  adventureTagline,
  coverUrl,
  joinCode,
  players,
  currentPlayerId,
  isOwner,
  onStart,
}: CampaignLobbyProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      await onStart();
    } catch {
      setError('เริ่มเกมไม่สำเร็จ ลองอีกครั้ง');
      setStarting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the code is still visible to copy by hand */
    }
  }

  return (
    <main className="screen lobby">
      <div className="lobby-cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {coverUrl && <img src={coverUrl} alt="" />}
        <div className="lobby-cover-text">
          <h1 className="h-display">{campaignName || 'ห้องรอผจญภัย'}</h1>
          {adventureTitle && <p className="lobby-adventure">{adventureTitle}</p>}
          {adventureTagline && <p className="lede">{adventureTagline}</p>}
        </div>
      </div>

      <section className="lobby-panel">
        <div>
          <label htmlFor="join-code-value" className="lobby-label">
            รหัสห้อง — ส่งให้เพื่อนเพื่อเข้าร่วม
          </label>
          <div className="join-code-row">
            <span id="join-code-value" className="join-code">
              {joinCode}
            </span>
            <button type="button" className="btn ghost" onClick={handleCopy}>
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
            </button>
          </div>
        </div>

        <section aria-label="ผู้เล่นที่เข้าห้องแล้ว">
          <h3 className="lobby-label">ผู้เล่นในห้อง ({players.length})</h3>
          <ol className="seats">
            {players.map((player) => (
              <li key={player.id} className={`seat${player.isOwner ? ' owner' : ''}`}>
                <b>
                  {player.displayName}
                  {player.id === currentPlayerId ? ' (คุณ)' : ''}
                </b>
                {player.isOwner && <small>เจ้าของห้อง</small>}
              </li>
            ))}
            <li className="seat empty" aria-hidden="true">
              รอเพื่อนเข้าห้อง…
            </li>
          </ol>
        </section>

        {isOwner ? (
          <button type="button" className="btn lobby-start" disabled={starting} onClick={handleStart}>
            {starting ? 'กำลังเริ่ม…' : 'เริ่มเกม'}
          </button>
        ) : (
          <p className="status">รอเจ้าของห้องกดเริ่มเกม…</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
