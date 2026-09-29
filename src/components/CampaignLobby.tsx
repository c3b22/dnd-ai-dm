'use client';

import { useState } from 'react';
import type { RoundPlayer } from '@/lib/supabase/players';

export interface CampaignLobbyProps {
  campaignName: string;
  adventureTitle?: string;
  joinCode: string;
  players: RoundPlayer[];
  currentPlayerId: string;
  isOwner: boolean;
  onStart: () => Promise<void>;
}

export function CampaignLobby({
  campaignName,
  adventureTitle,
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
    <main className="screen" style={{ maxWidth: 560 }}>
      <h1 className="h-display" style={{ fontSize: 'clamp(24px, 5vw, 34px)' }}>
        {campaignName || 'ห้องรอผจญภัย'}
      </h1>
      {adventureTitle && <p className="lede">{adventureTitle}</p>}

      <section className="panel" style={{ marginTop: 20 }}>
        <div>
          <label htmlFor="join-code-value" className="lede" style={{ display: 'block', marginBottom: 6 }}>
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

        <section className="card" aria-label="ผู้เล่นที่เข้าห้องแล้ว">
          <h3>ผู้เล่นในห้อง ({players.length})</h3>
          <ol className="pl-list">
            {players.map((player) => (
              <li key={player.id} className="pl-row">
                <span className="av" aria-hidden="true">
                  {player.displayName.charAt(0)}
                </span>
                <span className="who">
                  <span className="nm">
                    {player.displayName}
                    {player.id === currentPlayerId ? ' (คุณ)' : ''}
                    {player.isOwner ? ' · เจ้าของห้อง' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {isOwner ? (
          <button type="button" className="btn" disabled={starting} onClick={handleStart}>
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
