import { useState } from 'react';
import type { CampaignStats } from '@/lib/campaign/stats';
import type { CampaignFact } from '@/lib/memory/types';
import type { RoundPlayer } from '@/lib/supabase/players';
import { EPILOGUE_MARKER } from '@/lib/campaign/epilogue';
import { levelForXp } from '@/lib/character/leveling';
import { classOf } from '@/lib/character/classes';
import { itemLabel } from '@/lib/inventory/rules';
import { QuestLog } from './QuestLog';

export interface CampaignSummaryProps {
  /** The epilogue DM message (with its marker line), or null while it is still being written. */
  epilogue: string | null;
  stats: CampaignStats | null;
  players: RoundPlayer[];
  facts: CampaignFact[];
  /** L5: shown to the table owner only; resolves when the next chapter has started, rejects with a readable message otherwise. */
  onContinue?: () => Promise<void>;
}

// All text (epilogue, names, item names) is rendered as React text children, so it is escaped.
export function CampaignSummary({ epilogue, stats, players, facts, onContinue }: CampaignSummaryProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handleContinue() {
    if (!onContinue || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onContinue();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'สร้างภาคต่อไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  const epilogueText = epilogue?.replace(EPILOGUE_MARKER, '').trim() ?? '';
  const defeated = stats ? stats.defeated.minion + stats.defeated.normal + stats.defeated.strong + stats.defeated.boss : 0;

  return (
    <section className="card campaign-summary" aria-label="สรุปแคมเปญ">
      <h2>แคมเปญนี้จบแล้ว</h2>
      <p className="status">ห้องนี้เป็นแบบอ่านอย่างเดียว ไม่รับการกระทำใหม่</p>

      <h3>บทส่งท้าย</h3>
      {epilogueText ? (
        <p className="epilogue" style={{ whiteSpace: 'pre-wrap' }}>
          {epilogueText}
        </p>
      ) : (
        <p className="status">DM กำลังเขียนบทส่งท้าย…</p>
      )}

      {stats && (
        <>
          <h3>สถิติ</h3>
          <ul aria-label="สถิติ" className="summary-stats">
            <li>จำนวนรอบ {stats.rounds}</li>
            <li>
              ศัตรูที่ล้ม {defeated} (ลูกสมุน {stats.defeated.minion} · ธรรมดา {stats.defeated.normal} · เก่ง {stats.defeated.strong} · บอส{' '}
              {stats.defeated.boss})
            </li>
            <li>ทองที่ได้ {stats.gold}</li>
            <li>ไอเท็มวิเศษที่ได้ {stats.magicItems}</li>
            <li>ล้มลง {stats.downs} ครั้ง</li>
            <li>เสียชีวิต {stats.deaths} ครั้ง</li>
            <li>ทอยได้ 20 เต็ม {stats.nat20} ครั้ง</li>
          </ul>
        </>
      )}

      {players.length > 0 && (
        <>
          <h3>ตัวละคร</h3>
          <ul aria-label="ตัวละคร" className="summary-characters">
            {players.map((p) => {
              const cls = classOf(p.classId);
              return (
                <li key={p.id}>
                  <strong>{p.displayName}</strong> — เลเวล {levelForXp(p.xp ?? 0)}
                  {cls ? ` · ${cls.nameTh}` : ''}
                  {p.status === 'dead' ? ' · ล้มตาย' : ''}
                  <small>
                    {p.items.length > 0 ? p.items.map((i) => itemLabel(i)).join(', ') : 'ไม่มีไอเท็ม'} · ทอง {p.gold}
                  </small>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <QuestLog facts={facts} />

      {onContinue && (
        <div className="summary-continue">
          <button type="button" onClick={handleContinue} disabled={busy}>
            {busy ? 'DM กำลังเขียนภาคต่อ…' : 'ผจญภัยต่อ (ภาคต่อ)'}
          </button>
          {error && (
            <p role="alert" className="status">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
