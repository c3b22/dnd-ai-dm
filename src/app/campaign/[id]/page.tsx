'use client';

import { Suspense, use, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageList } from '@/components/MessageList';
import { ActionInput } from '@/components/ActionInput';
import { fetchInitialMessages, subscribeToNewMessages } from '@/lib/supabase/messagesRealtime';
import { submitAction } from '@/lib/supabase/submitAction';
import {
  subscribeToRoundActionCount,
  subscribeToCurrentRound,
} from '@/lib/supabase/roundActionsRealtime';
import { supabaseBrowserClient } from '@/lib/supabase/client';

function CampaignPageContent({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId') ?? '';
  const [roundId, setRoundId] = useState<string | null>(null);

  const triggerProcessing = useCallback((currentRoundId: string) => {
    fetch('/api/round/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: currentRoundId }),
    });
  }, []);

  useEffect(() => {
    supabaseBrowserClient
      .from('campaigns')
      .select('current_round_id')
      .eq('id', campaignId)
      .single()
      .then(({ data }) => setRoundId(data?.current_round_id ?? null));

    const unsubscribe = subscribeToCurrentRound(campaignId, (newRoundId) => {
      setRoundId(newRoundId);
    });
    return unsubscribe;
  }, [campaignId]);

  useEffect(() => {
    if (!roundId) return;
    const unsubscribe = subscribeToRoundActionCount(campaignId, roundId, (actionCount, playerCount) => {
      if (playerCount > 0 && actionCount >= playerCount) {
        triggerProcessing(roundId);
      }
    });
    return unsubscribe;
  }, [roundId, campaignId, triggerProcessing]);

  return (
    <main>
      <MessageList
        campaignId={campaignId}
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
      {roundId && (
        <ActionInput onSubmit={(actionText) => submitAction(roundId, playerId, actionText)} />
      )}
      {roundId && (
        <button onClick={() => triggerProcessing(roundId)}>
          Process round now (if someone is stuck)
        </button>
      )}
    </main>
  );
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CampaignPageContent campaignId={id} />
    </Suspense>
  );
}
