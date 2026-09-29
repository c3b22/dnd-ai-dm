'use client';

import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageList } from '@/components/MessageList';
import { ActionInput } from '@/components/ActionInput';
import { SceneBanner } from '@/components/SceneBanner';
import { PlayerOrder } from '@/components/PlayerOrder';
import { CampaignLobby } from '@/components/CampaignLobby';
import { D20Icon } from '@/components/D20Icon';
import { RoundTimer } from '@/components/RoundTimer';
import { CampaignSettingsPanel } from '@/components/CampaignSettingsPanel';
import { DEFAULT_SETTINGS, type CampaignSettings } from '@/lib/campaign/settings';
import {
  fetchCampaignSettings,
  saveCampaignSettings,
  subscribeToCampaignSettings,
} from '@/lib/supabase/campaignSettings';
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
  subscribeToCampaignStarted,
} from '@/lib/supabase/roundActionsRealtime';
import { startCampaignForClient } from '@/lib/supabase/startCampaign';
import { supabaseBrowserClient } from '@/lib/supabase/client';

function CampaignPageContent({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId') ?? '';
  const [roundId, setRoundId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ acted: number; total: number } | null>(null);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [adventureId, setAdventureId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [startedAt, setStartedAt] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
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
      .select('current_round_id, name, join_code, started_at')
      .eq('id', campaignId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else if (!data) setLoadError('ไม่พบแคมเปญนี้ หรือเบราว์เซอร์นี้ยังไม่ได้เป็นสมาชิก ลองเข้าร่วมใหม่อีกครั้ง');
        setRoundId(data?.current_round_id ?? null);
        setCampaignName(data?.name ?? '');
        setJoinCode(data?.join_code ?? '');
        setStartedAt(data?.started_at ?? null);
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

    fetchCampaignSettings(campaignId).then(setSettings);
    const unsubscribeSettings = subscribeToCampaignSettings(campaignId, setSettings);

    const unsubscribeRound = subscribeToCurrentRound(campaignId, (newRoundId) => {
      setRoundId(newRoundId);
    });
    const unsubscribeScene = subscribeToCurrentScene(campaignId, (newSceneId) => {
      if (newSceneId) setSceneId(newSceneId);
    });
    const unsubscribeStarted = subscribeToCampaignStarted(campaignId, setStartedAt);
    return () => {
      unsubscribeRound();
      unsubscribeScene();
      unsubscribeSettings();
      unsubscribeStarted();
    };
  }, [campaignId]);

  async function handleStart() {
    await startCampaignForClient(campaignId);
  }

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
    if (!roundId || !timeUp || processing || settings.roundSeconds === 0) return;
    if ((actionStatus?.acted ?? 0) > 0 && autoProcessedRound.current !== roundId) {
      autoProcessedRound.current = roundId;
      triggerProcessing(roundId);
    }
  }, [roundId, timeUp, processing, settings.roundSeconds, actionStatus?.acted, triggerProcessing]);

  async function handleSaveSettings(patch: Partial<CampaignSettings>) {
    setSettings(await saveCampaignSettings(campaignId, patch));
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

  const adventure = getAdventure(adventureId);

  if (loadingCampaign || loadError) {
    return (
      <main className="screen">
        {loadingCampaign && <p className="status">กำลังโหลดแคมเปญ…</p>}
        {loadError && (
          <p role="alert" className="error">
            {loadError}
          </p>
        )}
      </main>
    );
  }

  if (startedAt === null) {
    return (
      <CampaignLobby
        campaignName={campaignName}
        adventureTitle={adventure?.titleTh}
        joinCode={joinCode}
        players={players}
        currentPlayerId={playerId}
        isOwner={players.find((p) => p.id === playerId)?.isOwner ?? false}
        onStart={handleStart}
      />
    );
  }

  return (
    <main className="screen">
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
              reorderPolicy={settings.reorderPolicy}
            />
          )}
          {roundId && settings.roundSeconds > 0 && (
            <RoundTimer
              openedAt={openedAt}
              durationMs={settings.roundSeconds * 1000}
              paused={processing}
              onExpire={() => setTimeUp(true)}
            />
          )}
          <CampaignSettingsPanel
            settings={settings}
            isOwner={players.find((p) => p.id === playerId)?.isOwner ?? false}
            onSave={handleSaveSettings}
          />
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
