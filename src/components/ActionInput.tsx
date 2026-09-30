'use client';

import { useState } from 'react';

const QUICK_ACTIONS = ['โจมตี', 'เคลื่อนที่', 'พูดคุย', 'สำรวจรอบๆ'];

export interface ActionInputProps {
  onSubmit: (actionText: string) => Promise<void>;
  /** When set the player cannot act (for example a downed character): everything is locked and this is shown. */
  disabledReason?: string;
  /** True when this player already has an action in this round (for example a potion drunk from the inventory). */
  alreadyActed?: boolean;
}

export function ActionInput({ onSubmit, disabledReason, alreadyActed }: ActionInputProps) {
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      </div>
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
