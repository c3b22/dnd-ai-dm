'use client';

import { useState } from 'react';
import type { AbilityTarget } from '@/lib/character/classes';

const QUICK_ACTIONS = ['โจมตี', 'เคลื่อนที่', 'พูดคุย', 'สำรวจรอบๆ'];

export interface ActionInputProps {
  onSubmit: (actionText: string) => Promise<void>;
  /** When set the player cannot act (for example a downed character): everything is locked and this is shown. */
  disabledReason?: string;
  /** True when this player already has an action in this round (for example a potion drunk from the inventory). */
  alreadyActed?: boolean;
  /** The player's class ability; absent for classless players. */
  ability?: {
    nameTh: string;
    target: AbilityTarget;
    /** Eventful rounds left before it is ready; 0 means ready. */
    cooldown: number;
    /** Who can be picked as the target. */
    allies: { id: string; name: string }[];
    /** Shown instead of the default when nobody can be picked. */
    noTargetText?: string;
  };
  onUseAbility?: (targetId: string | null) => Promise<void>;
}

export function ActionInput({ onSubmit, disabledReason, alreadyActed, ability, onUseAbility }: ActionInputProps) {
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  async function handleSubmit(actionText: string) {
    if (!actionText.trim() || submitted || submitting || disabledReason || alreadyActed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(actionText.trim());
      setSubmitted(true);
      setFreeText('');
    } catch {
      setError('ส่ง action ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  async function useAbility(targetId: string | null) {
    if (!onUseAbility || submitted || submitting || disabledReason || alreadyActed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onUseAbility(targetId);
      setSubmitted(true);
      setPicking(false);
    } catch {
      setError('ส่ง action ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  const locked = submitted || submitting || Boolean(disabledReason) || Boolean(alreadyActed);

  return (
    <div className="dock">
      {disabledReason && <p className="down-note">{disabledReason}</p>}
      <div className="hint-row" role="group" aria-label="quick actions">
        <span className="lbl">เลือกเร็ว</span>
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="qa"
            disabled={locked}
            onClick={() => handleSubmit(action)}
          >
            {action}
          </button>
        ))}
        {ability && (
          <>
            <button
              type="button"
              className="qa ability"
              disabled={locked || ability.cooldown > 0}
              onClick={() => (ability.target ? setPicking((p) => !p) : useAbility(null))}
            >
              {ability.nameTh}
            </button>
            {ability.cooldown > 0 && (
              <>
                <span className="cd">อีก {ability.cooldown} รอบเหตุการณ์</span>
                <span className="cd">นับเฉพาะรอบที่มีเหตุการณ์เกิดขึ้น เช่น ถูกโจมตี ฟื้นฟู หรือได้ XP</span>
              </>
            )}
          </>
        )}
      </div>
      {ability && picking && !locked && (
        <div className="hint-row" role="group" aria-label="เลือกเป้าหมาย">
          <span className="lbl">เลือกเป้าหมาย</span>
          {ability.allies.length === 0 && <span className="cd">{ability.noTargetText ?? 'ไม่มีเพื่อนให้เลือก'}</span>}
          {ability.allies.map((ally) => (
            <button key={ally.id} type="button" className="qa" onClick={() => useAbility(ally.id)}>
              {ally.name}
            </button>
          ))}
        </div>
      )}
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(freeText);
        }}
      >
        <input
          aria-label="free text action"
          placeholder="หรือพิมพ์เอง เช่น “ค่อยๆ ย่องไปดูที่ท่าเรือ”"
          value={freeText}
          disabled={locked}
          onChange={(e) => setFreeText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={locked}>
          {submitting ? 'กำลังส่ง…' : 'ส่ง'}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {(submitted || alreadyActed) && <p className="status ok">ส่ง action แล้ว รอเพื่อนร่วมโต๊ะ…</p>}
    </div>
  );
}
