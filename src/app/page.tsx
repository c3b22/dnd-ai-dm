'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleCreate() {
    setError(null);
    // Loaded on click, not at module scope: this page is statically prerendered at build
    // time, and creating the Supabase client there would require its keys during `next build`.
    const { supabaseBrowserClient } = await import('@/lib/supabase/client');
    const { data, error: authError } = await supabaseBrowserClient.auth.signInAnonymously();
    if (authError || !data.user) {
      setError('Could not sign in. Please try again.');
      return;
    }

    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, userId: data.user.id, displayName }),
    });
    if (!response.ok) {
      setError('Could not create the campaign. Please try again.');
      return;
    }
    const { campaign, player } = await response.json();

    router.push(`/campaign/${campaign.id}?playerId=${player.id}`);
  }

  return (
    <main>
      <h1>D&amp;D AI Dungeon Master</h1>
      <input
        aria-label="campaign name"
        placeholder="Campaign name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        aria-label="display name"
        placeholder="Your display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <button onClick={handleCreate} disabled={!name.trim() || !displayName.trim()}>
        Create campaign
      </button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
