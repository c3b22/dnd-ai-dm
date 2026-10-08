'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MyCampaignSummary } from '@/lib/campaign/myCampaigns';

async function authHeader(): Promise<Record<string, string>> {
  // Loaded here, not at module scope: the home page is statically prerendered at build
  // time, and creating the Supabase client there would require its keys during `next build`.
  const { supabaseBrowserClient } = await import('@/lib/supabase/client');
  const { data } = await supabaseBrowserClient.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

export function MyCampaigns({ campaigns }: { campaigns: MyCampaignSummary[] }) {
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = campaigns.filter((c) => !removedIds.includes(c.id));
  if (visible.length === 0) return null;

  async function remove(c: MyCampaignSummary) {
    setError(null);
    setBusyId(c.id);
    const failure = c.isOwner ? 'ลบห้องไม่สำเร็จ ลองอีกครั้ง' : 'ออกจากห้องไม่สำเร็จ ลองอีกครั้ง';
    try {
      const response = await fetch(c.isOwner ? `/api/campaigns/${c.id}` : `/api/campaigns/${c.id}/leave`, {
        method: c.isOwner ? 'DELETE' : 'POST',
        headers: await authHeader(),
      });
      if (!response.ok) {
        setError(failure);
        return;
      }
      setRemovedIds((ids) => [...ids, c.id]);
      setConfirmingId(null);
    } catch {
      setError(failure);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel my-campaigns">
      <h2 className="lede">แคมเปญของคุณ</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="my-campaigns-list">
        {visible.map((c) => (
          <li key={c.id} className="my-campaign-item">
            <Link href={`/campaign/${c.id}?playerId=${c.playerId}`} className="my-campaign-row">
              <span className="name">{c.name}</span>
              <span className={`status-badge ${c.ended ? 'ended' : c.started ? 'playing' : 'waiting'}`}>
                {c.ended ? 'จบแล้ว' : c.started ? 'กำลังเล่น' : 'ในห้องรอ'}
              </span>
            </Link>
            {confirmingId === c.id ? (
              <div className="my-campaign-confirm">
                <p>
                  {c.isOwner
                    ? 'ลบห้องนี้ถาวร? ผู้เล่นทุกคนจะเสียห้องนี้ และกู้คืนไม่ได้'
                    : 'ออกจากห้องนี้? ตัวละครของคุณในห้องนี้จะถูกลบ และกู้คืนไม่ได้'}
                </p>
                <button type="button" className="btn" disabled={busyId === c.id} onClick={() => remove(c)}>
                  {c.isOwner ? 'ยืนยันลบห้อง' : 'ยืนยันออกจากห้อง'}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busyId === c.id}
                  onClick={() => setConfirmingId(null)}
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn ghost my-campaign-remove"
                onClick={() => {
                  setError(null);
                  setConfirmingId(c.id);
                }}
              >
                {c.isOwner ? 'ลบห้อง' : 'ออกจากห้อง'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
