'use client';

import { use, useEffect, useState } from 'react';
import { AdventureForm, type CustomScene } from '@/components/AdventureForm';
import { getAdventureById, type Adventure } from '@/lib/adventures/adventures';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export default function EditAdventurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [scenes, setScenes] = useState<CustomScene[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAdventureById(supabaseBrowserClient, id).then((data) => {
      if (!cancelled) setAdventure(data);
    });

    supabaseBrowserClient
      .from('custom_adventures')
      .select('scenes')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setScenes(data?.scenes ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

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
