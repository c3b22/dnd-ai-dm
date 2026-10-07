'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SharedAdventurePreview } from '@/lib/adventures/sharedAdventures';

const NOT_FOUND = 'ไม่พบโครงเรื่องนี้ หรือเจ้าของยกเลิกการแชร์แล้ว';

const IMPORT_ERRORS: Record<string, string> = {
  'cannot import your own adventure': 'นี่คือเนื้อเรื่องของคุณเองอยู่แล้ว',
  'shared adventure not found': NOT_FOUND,
};

export function SharedAdventurePreviewView({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<SharedAdventurePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/adventures/shared/${encodeURIComponent(code)}`);
        if (!response.ok) {
          if (!cancelled) setLoadError(NOT_FOUND);
          return;
        }
        const body = await response.json();
        if (!cancelled) setPreview(body);
      } catch {
        if (!cancelled) setLoadError(NOT_FOUND);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleImport() {
    setError(null);
    setImporting(true);
    try {
      // Loaded here, not at module scope, so the Supabase client isn't created during prerender.
      const { supabaseBrowserClient } = await import('@/lib/supabase/client');
      const { ensureAnonymousUser } = await import('@/lib/supabase/ensureAnonymousUser');
      const { user, error: authError } = await ensureAnonymousUser(supabaseBrowserClient);
      if (authError || !user) {
        setError('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง');
        return;
      }
      const { data } = await supabaseBrowserClient.auth.getSession();
      const response = await fetch(`/api/adventures/shared/${encodeURIComponent(code)}/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(IMPORT_ERRORS[body?.error] ?? 'เพิ่มเข้าคลังไม่สำเร็จ ลองอีกครั้ง');
        return;
      }
      router.push('/');
    } catch {
      setError('เพิ่มเข้าคลังไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setImporting(false);
    }
  }

  if (loadError) {
    return (
      <main className="screen" style={{ maxWidth: 560 }}>
        <p role="alert" className="error">{loadError}</p>
      </main>
    );
  }
  if (!preview) {
    return (
      <main className="screen" style={{ maxWidth: 560 }}>
        <p className="lede">กำลังโหลด…</p>
      </main>
    );
  }

  return (
    <main className="screen" style={{ maxWidth: 560 }}>
      <h1 className="h-display" style={{ fontSize: 'clamp(24px, 5vw, 34px)' }}>{preview.titleTh}</h1>
      <p className="lede">{preview.taglineTh}</p>
      <div className="panel" style={{ marginTop: 20 }}>
        <p>อารมณ์เรื่อง: {preview.toneTh}</p>
        <p>{preview.openingTh}</p>
        <p>{preview.actCount} องก์ · {preview.npcCount} NPC</p>
        <button className="btn" type="button" onClick={handleImport} disabled={importing}>
          {importing ? 'กำลังเพิ่ม…' : 'เพิ่มเข้าคลังของฉัน'}
        </button>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    </main>
  );
}
