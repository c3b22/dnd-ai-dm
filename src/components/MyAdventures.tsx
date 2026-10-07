'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface MyAdventureSummary {
  id: string;
  titleTh: string;
  taglineTh: string;
  thumbnailUrl: string | null;
  shareCode?: string | null;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function MyAdventures({
  adventures,
  getAccessToken,
}: {
  adventures: MyAdventureSummary[];
  getAccessToken?: () => Promise<string | undefined>;
}) {
  // Overrides keyed by adventure id; absent = use the code the list loaded with.
  const [codes, setCodes] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copy, setCopy] = useState<Record<string, CopyState>>({});

  if (adventures.length === 0) return null;

  const codeOf = (a: MyAdventureSummary) => (a.id in codes ? codes[a.id] : a.shareCode ?? null);
  const linkOf = (code: string) => `${window.location.origin}/adventures/shared/${code}`;

  async function toggleShare(id: string, enable: boolean) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: '' }));
    try {
      const token = await getAccessToken?.();
      const response = await fetch(`/api/adventures/${id}/share`, {
        method: enable ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('share failed');
      const body = await response.json();
      setCodes((c) => ({ ...c, [id]: body.shareCode ?? null }));
      setCopy((c) => ({ ...c, [id]: 'idle' }));
    } catch {
      setErrors((e) => ({
        ...e,
        [id]: enable ? 'แชร์ไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ยกเลิกการแชร์ไม่สำเร็จ ลองใหม่อีกครั้ง',
      }));
    } finally {
      setBusy(null);
    }
  }

  async function copyLink(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopy((c) => ({ ...c, [id]: 'copied' }));
    } catch {
      setCopy((c) => ({ ...c, [id]: 'failed' }));
    }
  }

  return (
    <section className="panel my-adventures">
      <h2 className="lede">คลังของฉัน</h2>
      <ul className="my-adventures-list">
        {adventures.map((a) => {
          const code = codeOf(a);
          const link = code ? linkOf(code) : null;
          return (
            <li key={a.id}>
              <Link href={`/adventures/${a.id}/edit`} className="my-adventure-row">
                <span className="title">{a.titleTh}</span>
                <span className="tagline">{a.taglineTh}</span>
                <span className="edit-label">แก้ไข</span>
              </Link>
              <div className="my-adventure-share">
                {link ? (
                  <>
                    <input readOnly value={link} aria-label="ลิงก์แชร์" onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" onClick={() => copyLink(a.id, link)}>
                      {copy[a.id] === 'copied' ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                    <button type="button" disabled={busy === a.id} onClick={() => toggleShare(a.id, false)}>
                      ยกเลิกการแชร์
                    </button>
                    {copy[a.id] === 'failed' && <span role="status">คัดลอกอัตโนมัติไม่ได้ โปรดก๊อปลิงก์ด้านบนเอง</span>}
                  </>
                ) : (
                  <button type="button" disabled={busy === a.id} onClick={() => toggleShare(a.id, true)}>
                    แชร์
                  </button>
                )}
                {errors[a.id] && <span role="alert">{errors[a.id]}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
