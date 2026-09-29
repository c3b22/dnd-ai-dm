'use client';

import { useEffect, useRef, useState } from 'react';

export interface RoundTimerProps {
  /** When the round opened (ISO string). */
  openedAt: string | null;
  durationMs: number;
  /** Pauses the countdown while the DM is already writing. */
  paused: boolean;
  onExpire: () => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RoundTimer({ openedAt, durationMs, paused, onExpire, now = Date.now }: RoundTimerProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expiredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!openedAt) {
      setRemaining(null);
      return;
    }
    const deadline = new Date(openedAt).getTime() + durationMs;
    const tick = () => {
      const left = deadline - now();
      setRemaining(left);
      if (left <= 0 && expiredFor.current !== openedAt) {
        expiredFor.current = openedAt;
        onExpire();
      }
    };
    tick();
    if (paused) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // onExpire is intentionally left out: it changes every render and must not restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedAt, durationMs, paused]);

  if (remaining === null) return null;
  const expired = remaining <= 0;

  return (
    <section className={`card timer${!expired && remaining < 30_000 ? ' low' : ''}`} aria-label="เวลาของรอบนี้">
      <h3>เวลาของรอบนี้</h3>
      <b role="timer">{expired ? 'หมดเวลา' : formatRemaining(remaining)}</b>
      <p className="order-hint">
        {expired
          ? 'DM จะตัดสินจาก action ที่ส่งมาแล้วทันที'
          : 'ถ้าเวลาหมด DM จะตัดสินจาก action ที่ส่งมาแล้ว คนที่ไม่ทันจะข้ามรอบนี้'}
      </p>
    </section>
  );
}
