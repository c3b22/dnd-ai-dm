'use client';

import { useState } from 'react';
import { ClassPicker } from './ClassPicker';
import { CharacterIdentityFields } from './CharacterIdentityFields';
import { DEFAULT_CLASS_ID } from '@/lib/character/classes';
import type { RespawnRequest } from '@/lib/supabase/players';

export interface RespawnFormProps {
  /** Level the new character will start at (average of living friends, rounded down). */
  startLevel: number;
  onSubmit: (request: RespawnRequest) => Promise<unknown>;
}

const ERRORS: Record<string, string> = {
  conflict: 'ตัวละครนี้ถูกสร้างใหม่ไปแล้ว',
  not_dead: 'ตัวละครของคุณยังไม่ตาย',
  not_found: 'ไม่พบผู้เล่นในห้องนี้',
};

export function RespawnForm({ startLevel, onSubmit }: RespawnFormProps) {
  const [displayName, setDisplayName] = useState('');
  const [classId, setClassId] = useState<string>(DEFAULT_CLASS_ID);
  const [identity, setIdentity] = useState({ backstory: '', personality: '', goal: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ displayName: displayName.trim(), classId, ...identity });
    } catch (e) {
      setError(ERRORS[(e as Error)?.message] ?? 'สร้างตัวละครใหม่ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="panel"
      aria-label="สร้างตัวละครใหม่"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <h2 className="h-display" style={{ fontSize: 22 }}>
        ตัวละครของคุณตายถาวรแล้ว
      </h2>
      <p className="lede">
        สร้างตัวละครใหม่เพื่อกลับเข้าโต๊ะเดิม ตัวใหม่จะเริ่มที่เลเวล {startLevel} (เฉลี่ยจากเพื่อนที่ยังมีชีวิต ปัดลง) พร้อมชุดเริ่มต้นของคลาส และทอง 0
      </p>
      <div className="field">
        <label htmlFor="respawn-name">ชื่อตัวละครใหม่</label>
        <input
          id="respawn-name"
          aria-label="display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <ClassPicker value={classId} onChange={setClassId} />
      <CharacterIdentityFields value={identity} onChange={setIdentity} idPrefix="respawn-identity" />
      <button className="btn" type="submit" disabled={!displayName.trim() || busy}>
        {busy ? 'กำลังสร้าง…' : 'สร้างตัวละครใหม่'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
