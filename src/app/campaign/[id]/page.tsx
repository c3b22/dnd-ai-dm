'use client';

import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageList } from '@/components/MessageList';
import { ActionInput } from '@/components/ActionInput';
import { SceneBanner } from '@/components/SceneBanner';
import { PlayerOrder } from '@/components/PlayerOrder';
import { D20Icon } from '@/components/D20Icon';
import { RoundTimer } from '@/components/RoundTimer';
import { getAdventure } from '@/lib/adventures/adventures';
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

// How long a round stays open before the DM goes ahead with the actions already in.
const ROUND_DURATION_MS = 5 * 60 * 1000;

function CampaignPageContent({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId') ?? '';
  const [roundId, setRoundId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ acted: number; total: number } | null>(null);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [adventureId, setAdventureId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const autoProcessedRound = useRef<string | null>(null);

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
      .select('current_round_id, name')
      .eq('id', campaignId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else if (!data) setLoadError('ไม่พบแคมเปญนี้ หรือเบราว์เซอร์นี้ยังไม่ได้เป็นสมาชิก ลองเข้าร่วมใหม่อีกครั้ง');
        setRoundId(data?.current_round_id ?? null);
        setCampaignName(data?.name ?? '');
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

  async function applyOrder(reordered: RoundPlayer[]) {
    setPlayers(reordered);
    try {
      await saveTurnOrder(campaignId, playerId, reordered.map((p) => p.id));
    } catch {
      refreshPlayers();
    }
  }

  function handleMove(movedId: string, direction: -1 | 1) {
    const index = players.findIndex((p) => p.id === movedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= players.length) return;
    const reordered = [...players];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    applyOrder(reordered);
  }

  function handleReorder(draggedId: string, targetId: string) {
    const from = players.findIndex((p) => p.id === draggedId);
    const to = players.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const reordered = [...players];
    reordered.splice(to, 0, reordered.splice(from, 1)[0]);
    applyOrder(reordered);
  }

  useEffect(() => {
    setOpenedAt(null);
    setTimeUp(false);
    if (!roundId) return;
    supabaseBrowserClient
      .from('rounds')
      .select('opened_at')
      .eq('id', roundId)
      .maybeSingle()
      .then(({ data }) => setOpenedAt(data?.opened_at ?? null));
  }, [roundId]);

  // Once time is up the DM goes ahead with whatever has been submitted (one client wins the claim).
  useEffect(() => {
    if (!roundId || !timeUp || processing) return;
    if ((actionStatus?.acted ?? 0) > 0 && autoProcessedRound.current !== roundId) {
      autoProcessedRound.current = roundId;
      triggerProcessing(roundId);
    }
  }, [roundId, timeUp, processing, actionStatus?.acted, triggerProcessing]);

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

  const adventure = getAdventure(adventureId);

  return (
    <main className="screen">
      {loadingCampaign && <p className="status">กำลังโหลดแคมเปญ…</p>}
      {loadError && (
        <p role="alert" className="error">
          {loadError}
        </p>
      )}
      <div className="table-grid">
        <div className="stage">
          <div className="stage-head">
            <span className="n">{campaignName || adventure?.titleTh || 'โต๊ะเล่น'}</span>
            {adventure && <span className="round">{adventure.titleTh}</span>}
          </div>
          <SceneBanner sceneId={sceneId} adventureId={adventureId} />
          <MessageList
            campaignId={campaignId}
            fetchInitialMessages={fetchInitialMessages}
            subscribeToNewMessages={subscribeToNewMessages}
          />
          {processing && (
            <div className="thinking" role="status" aria-live="polite">
              <span className="d20">
                <D20Icon />
              </span>
              <span>DM กำลังเรียบเรียงเรื่องราว… อาจใช้เวลาสักครู่ (ยังไม่ค้าง)</span>
            </div>
          )}
          {roundId && (
            <ActionInput
              key={roundId}
              onSubmit={(actionText) => submitAction(roundId, playerId, actionText)}
            />
          )}
        </div>

        <aside className="rail">
          {players.length > 0 && (
            <PlayerOrder
              players={players}
              currentPlayerId={playerId}
              locked={players.find((p) => p.id === playerId)?.acted ?? false}
              onMove={handleMove}
              onReorder={handleReorder}
            />
          )}
          {roundId && (
            <RoundTimer
              openedAt={openedAt}
              durationMs={ROUND_DURATION_MS}
              paused={processing}
              onExpire={() => setTimeUp(true)}
            />
          )}
          {adventure && (
            <section className="card" aria-label="เรื่องที่เล่น">
              <h3>เรื่องที่เล่น</h3>
              <div className="quest">
                {adventure.titleTh}
                <small>{adventure.taglineTh}</small>
              </div>
            </section>
          )}
          {roundId && (
            <button type="button" className="btn ghost" onClick={() => triggerProcessing(roundId)}>
              ให้ DM ตัดสินตอนนี้ (ถ้ามีคนติดอยู่)
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="status">กำลังโหลด…</p>}>
      <CampaignPageContent campaignId={id} />
    </Suspense>
  );
}
