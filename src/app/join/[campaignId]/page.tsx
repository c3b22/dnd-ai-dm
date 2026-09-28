'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowserClient } from '@/lib/supabase/client';

export default function JoinPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const [displayName, setDisplayName] = useState('');
  const router = useRouter();

  async function handleJoin() {
    const { data, error } = await supabaseBrowserClient.auth.signInAnonymously();
    if (error || !data.user) return;

    const response = await fetch(`/api/campaigns/${campaignId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.user.id, displayName }),
    });
    const player = await response.json();

    router.push(`/campaign/${campaignId}?playerId=${player.id}`);
  }

  return (
    <main>
      <input
        aria-label="display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <button onClick={handleJoin}>Join campaign</button>
    </main>
  );
}
