'use client';

import { useEffect, useRef, useState } from 'react';
import type { LoadRecap } from '@/lib/supabase/recapClient';

export interface RecapCardProps {
  /** Auto mode runs once, when this turns true (room loaded). */
  ready: boolean;
  load: LoadRecap;
  /** Incremented by the "สรุปเรื่อง" rail button; each change asks again in manual mode (force). */
  manualRequest: number;
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'text'; text: string }
  | { kind: 'note'; message: string };

// Personal "previously on" box above the story. Never posts to the chat; only this player sees it.
export function RecapCard({ ready, load, manualRequest }: RecapCardProps) {
  const [view, setView] = useState<View>({ kind: 'idle' });
  const autoDone = useRef(false);
  const lastManual = useRef(manualRequest);
  const token = useRef(0); // ignore stale responses when a newer request starts

  async function run(force: boolean) {
    const mine = ++token.current;
    setView({ kind: 'loading' });
    const result = await load(force);
    if (mine !== token.current) return;
    if (result.kind === 'text') setView({ kind: 'text', text: result.text });
    else if (force) {
      setView({
        kind: 'note',
        message: result.kind === 'error' ? 'สรุปเรื่องไม่สำเร็จ ลองใหม่อีกครั้ง' : 'ยังไม่มีอะไรให้สรุป',
      });
    } else setView({ kind: 'idle' });
  }

  useEffect(() => {
    if (!ready || autoDone.current) return;
    autoDone.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (manualRequest === lastManual.current) return;
    lastManual.current = manualRequest;
    void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualRequest]);

  if (view.kind === 'idle') return null;

  return (
    <section className="card recap-card" aria-label="ตอนที่แล้ว…" aria-busy={view.kind === 'loading'}>
      <div className="recap-head">
        <h3>ตอนที่แล้ว…</h3>
        <button
          type="button"
          className="recap-close"
          aria-label="ปิด"
          onClick={() => {
            token.current++;
            setView({ kind: 'idle' });
          }}
        >
          ✕
        </button>
      </div>
      {view.kind === 'loading' && <p className="status">กำลังสรุปเรื่อง…</p>}
      {view.kind === 'text' && <p className="recap-text">{view.text}</p>}
      {view.kind === 'note' && <p className="status">{view.message}</p>}
    </section>
  );
}
