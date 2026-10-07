'use client';

import { useState } from 'react';

export const ASK_LIMIT = 3;
export const CHAT_MAX_LENGTH = 500;

export interface ChatPanelProps {
  onSendChat: (content: string) => Promise<void>;
  onAsk: (question: string) => Promise<void>;
  /** Questions this player already used in the current round. */
  asksUsed: number;
  askLimit?: number;
}

/** Maps a failed request to Thai text. Anything unknown gets a generic message. */
export function describeChatError(error: unknown, mode: 'chat' | 'ask'): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return 'ใช้โควตาถาม DM ของรอบนี้หมดแล้ว รอรอบหน้านะ';
  if (status === 401) return 'กรุณาเข้าสู่ระบบอีกครั้ง';
  if (status === 403) return 'เฉพาะสมาชิกของห้องนี้เท่านั้น';
  if (status === 502) return 'DM ยังตอบไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง';
  if (status === 400) {
    return mode === 'ask' ? 'ถามไม่ได้ในตอนนี้ (ข้อความว่าง ยาวเกิน หรือรอบยังไม่เปิด)' : 'ส่งข้อความไม่ได้ (ว่างหรือยาวเกิน)';
  }
  return mode === 'ask' ? 'ถาม DM ไม่สำเร็จ ลองอีกครั้ง' : 'ส่งข้อความไม่สำเร็จ ลองอีกครั้ง';
}

export function ChatPanel({ onSendChat, onAsk, asksUsed, askLimit = ASK_LIMIT }: ChatPanelProps) {
  const [mode, setMode] = useState<'chat' | 'ask'>('chat');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, askLimit - asksUsed);
  const outOfQuota = mode === 'ask' && remaining === 0;

  async function handleSubmit() {
    const value = text.trim();
    if (!value || sending || outOfQuota) return;
    setError(null);
    setSending(true);
    try {
      if (mode === 'chat') await onSendChat(value);
      else await onAsk(value);
      setText('');
    } catch (e) {
      setError(describeChatError(e, mode));
    } finally {
      setSending(false);
    }
  }

  function switchMode(next: 'chat' | 'ask') {
    setMode(next);
    setError(null);
  }

  return (
    <section className="chat-panel" aria-label="แชทและถาม DM">
      <div className="chat-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'chat'}
          className={`qa${mode === 'chat' ? ' ability' : ''}`}
          onClick={() => switchMode('chat')}
        >
          แชททีม
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'ask'}
          className={`qa${mode === 'ask' ? ' ability' : ''}`}
          onClick={() => switchMode('ask')}
        >
          ถาม DM
        </button>
        {mode === 'ask' && (
          <span className="cd" aria-live="polite">
            เหลือ {remaining}/{askLimit} คำถามในรอบนี้
          </span>
        )}
      </div>
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <input
          aria-label={mode === 'chat' ? 'ข้อความแชททีม' : 'คำถามถึง DM'}
          placeholder={
            mode === 'chat' ? 'คุยกับเพื่อนร่วมทีม (ไม่นับเป็น action)' : 'ถาม DM เรื่องที่ตัวละครรู้อยู่แล้ว (ไม่นับเป็น action)'
          }
          maxLength={CHAT_MAX_LENGTH}
          value={text}
          disabled={sending || outOfQuota}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={sending || outOfQuota || !text.trim()}>
          {sending ? 'กำลังส่ง…' : mode === 'chat' ? 'ส่ง' : 'ถาม'}
        </button>
      </form>
      {outOfQuota && !error && <p className="status">ใช้โควตาถาม DM ของรอบนี้หมดแล้ว</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
