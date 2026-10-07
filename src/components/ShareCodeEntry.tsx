'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractShareCode } from '@/lib/adventures/extractShareCode';

export function ShareCodeEntry() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const code = extractShareCode(value);
    if (!code) {
      setError('โค้ดหรือลิงก์ไม่ถูกต้อง');
      return;
    }
    setError(null);
    router.push(`/adventures/shared/${encodeURIComponent(code)}`);
  }

  return (
    <form
      className="panel join-by-code"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="field">
        <label htmlFor="share-code-input">มีโค้ดโครงเรื่อง?</label>
        <input
          id="share-code-input"
          aria-label="share code"
          placeholder="วางโค้ดหรือลิงก์ที่เพื่อนแชร์มา"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button className="btn ghost" type="submit" disabled={!value.trim()}>
        ดูโครงเรื่อง
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
