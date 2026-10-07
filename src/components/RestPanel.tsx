'use client';

import { useState } from 'react';
import { SHORT_REST_MAX_PER_LONG_REST } from '@/lib/character/restConstants';
import type { RestKind, RestVote } from '@/lib/campaign/restVote';

export interface RestPanelProps {
  /** Current rest vote; null = none (or expired). */
  vote: RestVote | null;
  players: { id: string; displayName: string; status: 'active' | 'downed' | 'dead' }[];
  currentPlayerId: string;
  /** True while a combat encounter is running: resting is locked. */
  encounterActive: boolean;
  /** How many short rests this player has used since the last long rest. */
  shortRestsUsed: number;
  /** The room owner may cancel any vote. */
  isOwner?: boolean;
  onPropose: (kind: RestKind) => Promise<void>;
  onAgree: () => Promise<void>;
  onCancel: () => Promise<void>;
}

const KIND_LABEL: Record<RestKind, string> = { short: 'พักสั้น', long: 'พักยาว' };

export function RestPanel({
  vote,
  players,
  currentPlayerId,
  encounterActive,
  shortRestsUsed,
  isOwner = false,
  onPropose,
  onAgree,
  onCancel,
}: RestPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = players.find((p) => p.id === currentPlayerId);
  const active = players.filter((p) => p.status === 'active');
  const needed = Math.floor(active.length / 2) + 1;
  const shortLeft = Math.max(0, SHORT_REST_MAX_PER_LONG_REST - shortRestsUsed);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  const cannotAct = me.status !== 'active';
  const blockReason = encounterActive
    ? 'กำลังต่อสู้อยู่ พักไม่ได้'
    : cannotAct
      ? 'ตัวละครของคุณพักหรือโหวตไม่ได้ในสภาพนี้'
      : null;

  if (vote) {
    const agreedNames = vote.agree
      .map((id) => players.find((p) => p.id === id)?.displayName)
      .filter((n): n is string => Boolean(n));
    const agreedCount = vote.agree.filter((id) => active.some((p) => p.id === id)).length;
    const iAgreed = vote.agree.includes(currentPlayerId);
    const canCancel = vote.proposerId === currentPlayerId || isOwner;
    return (
      <section className="card rest-panel" aria-label="พัก">
        <div className="rest-head">
          {vote.status === 'passed' ? (
            <span>โหวตผ่านแล้ว: {KIND_LABEL[vote.kind]} จะเกิดขึ้นเมื่อจบรอบนี้</span>
          ) : (
            <span>โหวต{KIND_LABEL[vote.kind]}</span>
          )}
        </div>
        <div className="rest-votes" role="status" aria-live="polite">
          <span>เห็นด้วยแล้ว: {agreedNames.join(', ') || '-'}</span>
          {vote.status === 'open' && <span className="rest-count">{`${agreedCount} / ${needed} คน`}</span>}
        </div>
        <div className="rest-actions">
          {vote.status === 'open' && !iAgreed && !blockReason && (
            <button type="button" className="btn" disabled={busy} onClick={() => run(onAgree)}>
              เห็นด้วย
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => run(onCancel)}>
              ยกเลิกโหวต
            </button>
          )}
        </div>
        {blockReason && vote.status === 'open' && <p className="rest-reason">{blockReason}</p>}
        {error && (
          <p className="rest-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  const shortBlocked = Boolean(blockReason) || shortLeft === 0;
  return (
    <section className="card rest-panel" aria-label="พัก">
      <div className="rest-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || shortBlocked}
          onClick={() => run(() => onPropose('short'))}
        >
          เสนอพักสั้น
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || Boolean(blockReason)}
          onClick={() => run(() => onPropose('long'))}
        >
          เสนอพักยาว
        </button>
      </div>
      <p className="rest-left">{`พักสั้นเหลือ ${shortLeft} จาก ${SHORT_REST_MAX_PER_LONG_REST} ครั้ง`}</p>
      {blockReason && <p className="rest-reason">{blockReason}</p>}
      {error && (
        <p className="rest-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
