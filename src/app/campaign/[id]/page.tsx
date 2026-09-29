'use client';

import { Suspense, use, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageList } from '@/components/MessageList';
import { ActionInput } from '@/components/ActionInput';
import { SceneBanner } from '@/components/SceneBanner';
import { PlayerOrder } from '@/components/PlayerOrder';
import {
  fetchRoundPlayers,
  saveTurnOrder,
  subscribeToPlayers,
  type RoundPlayer,
} from '@/lib/supabase/players';
import { fetchInitialMessages, subscribeToNewMessages } from '@/lib/supabase/messagesRealtime';
import { submitAction } from '@/lib/supabase/submitAction';
import {
  subscribeToRoundActionCount,
  subscribeToCurrentRound,
  subscribeToCurrentScene,
} from '@/lib/supabase/roundActionsRealtime';
import { supabaseBrowserClient } from '@/lib/supabase/client';

function CampaignPageContent({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId') ?? '';
  const [roundId, setRoundId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ acted: number; total: number } | null>(null);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [adventureId, setAdventureId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [processing, setProcessing] = useState(false);

  const triggerProcessing = useCallback((currentRoundId: string) => {
    setProcessing(true);
    fetch('/api/round/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: currentRoundId }),
    })
      .catch(() => {})
      .finally(() => setProcessing(false));
  }, []);

  useEffect(() => {
    supabaseBrowserClient
      .from('campaigns')
      .select('current_round_id')
      .eq('id', campaignId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else if (!data) setLoadError('Campaign not found, or this browser session is not a member of it. Try joining again.');
        setRoundId(data?.current_round_id ?? null);
        setLoadingCampaign(false);
      });

    // Separate query so a database without the scene columns still loads the campaign.
    supabaseBrowserClient
      .from('campaigns')
      .select('adventure_id, current_scene_id')
      .eq('id', campaignId)
      .maybeSingle()
      .then(({ data }) => {
        setAdventureId(data?.adventure_id ?? null);
        setSceneId(data?.current_scene_id ?? null);
      });

    const unsubscribeRound = subscribeToCurrentRound(campaignId, (newRoundId) => {
      setRoundId(newRoundId);
    });
    const unsubscribeScene = subscribeToCurrentScene(campaignId, (newSceneId) => {
      if (newSceneId) setSceneId(newSceneId);
    });
    return () => {
      unsubscribeRound();
      unsubscribeScene();
    };
  }, [campaignId]);

  const refreshPlayers = useCallback(() => {
    fetchRoundPlayers(campaignId, roundId)
      .then(setPlayers)
      .catch(() => {});
  }, [campaignId, roundId]);

  useEffect(() => {
    refreshPlayers();
    return subscribeToPlayers(campaignId, refreshPlayers);
  }, [campaignId, refreshPlayers, actionStatus?.acted]);

  async function handleMove(movedId: string, direction: -1 | 1) {
    const index = players.findIndex((p) => p.id === movedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= players.length) return;
    const reordered = [...players];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPlayers(reordered);
    try {
      await saveTurnOrder(campaignId, playerId, reordered.map((p) => p.id));
    } catch {
      refreshPlayers();
    }
  }

  useEffect(() => {
    if (!roundId) return;
    setActionStatus(null);
    const unsubscribe = subscribeToRoundActionCount(campaignId, roundId, (actionCount, playerCount) => {
      setActionStatus({ acted: actionCount, total: playerCount });
      if (playerCount > 0 && actionCount >= playerCount) {
        triggerProcessing(roundId);
      }
    });
    return unsubscribe;
  }, [roundId, campaignId, triggerProcessing]);

  return (
    <main>
      <style>{`@keyframes dm-spin{to{transform:rotate(360deg)}}`}</style>
      {loadingCampaign && <p>Loading campaign…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <SceneBanner sceneId={sceneId} adventureId={adventureId} />
      <MessageList
        campaignId={campaignId}
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
      {players.length > 0 && (
        <PlayerOrder
          players={players}
          currentPlayerId={playerId}
          locked={players.find((p) => p.id === playerId)?.acted ?? false}
          onMove={handleMove}
        />
      )}
      {processing && (
        <p role="status" aria-live="polite">
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              marginRight: 8,
              border: '2px solid #ccc',
              borderTopColor: '#333',
              borderRadius: '50%',
              animation: 'dm-spin 0.8s linear infinite',
              verticalAlign: 'middle',
            }}
          />
          The Dungeon Master is narrating… please wait.
        </p>
      )}
      {roundId && (
        <ActionInput
          key={roundId}
          onSubmit={(actionText) => submitAction(roundId, playerId, actionText)}
        />
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
