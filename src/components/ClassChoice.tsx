'use client';

import { useState } from 'react';
import type { PendingChoice } from '@/lib/character/classOptionsView';

export interface ClassChoiceProps {
  /** Choices open for this character (subclass at Lv3, new ability at Lv6 / Lv9); nothing renders when empty. */
  choices: PendingChoice[];
  onChoose: (choice: PendingChoice, optionId: string) => Promise<void>;
}

const TITLE: Record<PendingChoice['kind'], string> = { subclass: 'เลือกสายอาชีพ', pick: 'เลือกท่าใหม่' };

/** K7: badge + panel for the subclass / new-ability choices, modelled on AbilityChoice. Choosing never blocks the round. */
export function ClassChoice({ choices, onChoose }: ClassChoiceProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choice = choices[0];
  if (!choice) return null;
  const label = `${TITLE[choice.kind]} (เลเวล ${choice.level})`;

  if (!open) {
    return (
      <button type="button" className="ability-badge" onClick={() => setOpen(true)}>
        {label}
        {choices.length > 1 ? ` · ยังมีอีก ${choices.length - 1} ครั้ง` : ''}
      </button>
    );
  }

  async function confirm() {
    if (!picked || !choice) return;
    setBusy(true);
    setError('');
    try {
      await onChoose(choice, picked);
      setOpen(false);
      setPicked(null);
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ability-choice" role="group" aria-label={label}>
      <div className="ability-grid">
        {choice.options.map((option) => (
          <label key={option.id} className="ability-opt">
            <input
              type="radio"
              name={`class-choice-${choice.kind}-${choice.level}`}
              aria-label={option.nameTh}
              checked={picked === option.id}
              disabled={busy}
              onChange={() => setPicked(option.id)}
            />
            <b>{option.nameTh}</b> {option.descTh}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="ability-error">
          {error}
        </p>
      )}
      <div className="ability-actions">
        <button type="button" onClick={confirm} disabled={busy || !picked}>
          ยืนยัน
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
