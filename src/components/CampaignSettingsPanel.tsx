'use client';

import { useState } from 'react';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_OPTIONS,
  NARRATION_LABELS,
  NARRATION_OPTIONS,
  REORDER_LABELS,
  REORDER_OPTIONS,
  ROUND_SECONDS_OPTIONS,
  roundSecondsLabel,
  type CampaignSettings,
} from '@/lib/campaign/settings';

export interface CampaignSettingsPanelProps {
  settings: CampaignSettings;
  isOwner: boolean;
  /** The game has started: permadeath is then locked. */
  started?: boolean;
  onSave: (patch: Partial<CampaignSettings>) => Promise<void>;
}

export function CampaignSettingsPanel({ settings, isOwner, started = false, onSave }: CampaignSettingsPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CampaignSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(settings);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setError('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  const summary: [string, string][] = [
    ['เวลาต่อรอบ', roundSecondsLabel(settings.roundSeconds)],
    ['ความยาวคำบรรยาย', NARRATION_LABELS[settings.narrationLength]],
    ['ความยาก', DIFFICULTY_LABELS[settings.difficulty]],
    ['ลูกเต๋า', settings.diceEnabled ? 'ใช้ทอย d20' : 'ไม่ใช้ลูกเต๋า'],
    ['คนที่จัดลำดับได้', REORDER_LABELS[settings.reorderPolicy]],
    ['โหมดตายจริง', settings.permadeath ? 'เปิด' : 'ปิด'],
  ];

  if (!editing) {
    return (
      <section className="card" aria-label="ตั้งค่าโต๊ะ">
        <h3>ตั้งค่าโต๊ะ</h3>
        <dl className="settings-list">
          {summary.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {isOwner ? (
          <button type="button" className="btn ghost" onClick={startEditing}>
            แก้ไขการตั้งค่า
          </button>
        ) : (
          <p className="order-hint">เจ้าของโต๊ะเท่านั้นที่แก้ไขการตั้งค่าได้</p>
        )}
      </section>
    );
  }

  return (
    <form
      className="card"
      aria-label="แก้ไขการตั้งค่าโต๊ะ"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <h3>แก้ไขการตั้งค่า</h3>
      <div className="field">
        <label htmlFor="set-round">เวลาต่อรอบ</label>
        <select
          id="set-round"
          value={draft.roundSeconds}
          onChange={(e) => setDraft({ ...draft, roundSeconds: Number(e.target.value) })}
        >
          {ROUND_SECONDS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {roundSecondsLabel(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="set-length">ความยาวคำบรรยาย</label>
        <select
          id="set-length"
          value={draft.narrationLength}
          onChange={(e) => setDraft({ ...draft, narrationLength: e.target.value as CampaignSettings['narrationLength'] })}
        >
          {NARRATION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {NARRATION_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="set-difficulty">ความยาก</label>
        <select
          id="set-difficulty"
          value={draft.difficulty}
          onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as CampaignSettings['difficulty'] })}
        >
          {DIFFICULTY_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {DIFFICULTY_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.diceEnabled}
          onChange={(e) => setDraft({ ...draft, diceEnabled: e.target.checked })}
        />
        ใช้ลูกเต๋า d20 ตัดสินผล
      </label>
      <div className="field">
        <label htmlFor="set-reorder">คนที่จัดลำดับ action ได้</label>
        <select
          id="set-reorder"
          value={draft.reorderPolicy}
          onChange={(e) => setDraft({ ...draft, reorderPolicy: e.target.value as CampaignSettings['reorderPolicy'] })}
        >
          {REORDER_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {REORDER_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.permadeath}
          disabled={started}
          onChange={(e) => setDraft({ ...draft, permadeath: e.target.checked })}
        />
        โหมดตายจริง (ตัวละครที่ตายแล้วไม่กลับมา){started ? ' — แก้ไม่ได้หลังเริ่มเกม' : ''}
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="settings-actions">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button type="button" className="btn ghost" disabled={saving} onClick={() => setEditing(false)}>
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
