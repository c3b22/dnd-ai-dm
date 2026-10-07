'use client';

import { use } from 'react';
import { SharedAdventurePreviewView } from '@/components/SharedAdventurePreview';

export default function SharedAdventurePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <SharedAdventurePreviewView code={code} />;
}
