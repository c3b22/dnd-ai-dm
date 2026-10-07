'use client';

import { useState } from 'react';
import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '@/lib/character/constants';
import { ABILITY_SCORE_MAX, type AbilityChoice as Choice } from '@/lib/character/leveling';

export interface AbilityChoiceProps {
  abilities: AbilityScores;
  /** Unspent ability score improvements; nothing renders when this is 0. */
  remaining: number;
  onConfirm: (choice: Choice) => Promise<void>;
}

type Mode = 'double' | 'split';

export function AbilityChoice({ abilities, remaining, onConfirm }: AbilityChoiceProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('double');
  const [picked, setPicked] = useState<AbilityKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (remaining <= 0) return null;

  const bump = mode === 'double' ? 2 : 1;
  const need = mode === 'double' ? 1 : 2;

  function pick(key: AbilityKey) {
    setPicked((prev) => {
      if (mode === 'double') return [key];
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return prev.length >= 2 ? [prev[1], key] : [...prev, key];
    });
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setPicked([]);
  }

  async function confirm() {
    if (picked.length !== need) return;
    const choice: Choice =
      mode === 'double' ? { kind: 'double', ability: picked[0] } : { kind: 'split', abilities: [picked[0], picked[1]] };
    setBusy(true);
    setError('');
    try {
      await onConfirm(choice);
      setOpen(false);
      setPicked([]);
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ability-badge" onClick={() => setOpen(true)}>
        มีแต้มเพิ่มค่าความสามารถ {remaining} ครั้ง
      </button>
    );
  }

  return (
    <div className="ability-choice" role="group" aria-label="เลือกเพิ่มค่าความสามารถ">
      <div className="ability-modes">
        <label>
          <input
            type="radio"
            name="ability-mode"
            checked={mode === 'double'}
            onChange={() => chooseMode('double')}
            aria-label="+2 ค่าเดียว"
          />
          +2 ค่าเดียว
        </label>
        <label>
          <input
            type="radio"
            name="ability-mode"
            checked={mode === 'split'}
            onChange={() => chooseMode('split')}
            aria-label="+1 สองค่า"
          />
          +1 สองค่า
        </label>
      </div>
      <div className="ability-grid">
        {ABILITY_KEYS.map((key) => (
          <label key={key} className="ability-opt">
            <input
              type="checkbox"
              aria-label={key}
              checked={picked.includes(key)}
              disabled={busy || abilities[key] + bump > ABILITY_SCORE_MAX}
              onChange={() => pick(key)}
            />
            {key} {abilities[key]}
            {picked.includes(key) ? ` → ${abilities[key] + bump}` : ''}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="ability-error">
          {error}
        </p>
      )}
      <div className="ability-actions">
        <button type="button" onClick={confirm} disabled={busy || picked.length !== need}>
          ยืนยัน
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
