'use client';

import { use, useEffect, useState } from 'react';
import { AdventureForm, type CustomScene } from '@/components/AdventureForm';
import { getAdventureById, type Adventure } from '@/lib/adventures/adventures';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export default function EditAdventurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [scenes, setScenes] = useState<CustomScene[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAdventureById(supabaseBrowserClient, id)
      .then((data) => {
        if (cancelled) return;
        if (!data) setLoadError('ไม่พบเนื้อเรื่องนี้');
        else setAdventure(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError('โหลดเนื้อเรื่องไม่สำเร็จ ลองใหม่อีกครั้ง');
      });

    supabaseBrowserClient
      .from('custom_adventures')
      .select('scenes')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError('โหลดเนื้อเรื่องไม่สำเร็จ ลองใหม่อีกครั้ง');
        else setScenes(data?.scenes ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <main className="screen">
        <p role="alert" className="error">
          {loadError}
        </p>
      </main>
    );
  }

  if (!adventure || scenes === null) {
    return (
      <main className="screen">
        <p className="status">กำลังโหลด…</p>
      </main>
    );
  }

  return (
    <main className="screen">
      <AdventureForm existing={{ ...adventure, scenes }} />
    </main>
  );
}
