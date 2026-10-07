'use client';

import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageList } from '@/components/MessageList';
import { ActionInput } from '@/components/ActionInput';
import { ASK_LIMIT, ChatPanel } from '@/components/ChatPanel';
import { askDmForClient, fetchAskCount, sendTeamChat } from '@/lib/supabase/chatClient';
import { SceneBanner } from '@/components/SceneBanner';
import { PlayerOrder } from '@/components/PlayerOrder';
import { RespawnForm } from '@/components/RespawnForm';
import { respawnLevel } from '@/lib/character/respawnLevel';
import { levelForXp, type AbilityChoice } from '@/lib/character/leveling';
import { SPELLS, SPELL_IDS, mageSpellSlots } from '@/lib/character/spells';
import { EncounterPanel } from '@/components/EncounterPanel';
import { RestPanel } from '@/components/RestPanel';
import { fetchRestState, requestRest, subscribeToRestVote } from '@/lib/supabase/restVoteClient';
import type { RestKind, RestVote } from '@/lib/campaign/restVote';
import { Inventory } from '@/components/Inventory';
import { Shop } from '@/components/Shop';
import { Trades } from '@/components/Trades';
import { QuestLog } from '@/components/QuestLog';
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
import { getAdventureById, type Adventure } from '@/lib/adventures/adventures';
import {
  fetchRoundPlayers,
  requestAbilityChoice,
  requestRespawn,
  type RespawnRequest,
  saveTurnOrder,
  subscribeToPlayers,
  type RoundPlayer,
} from '@/lib/supabase/players';
import { fetchInitialMessages, subscribeToNewMessages } from '@/lib/supabase/messagesRealtime';
import { submitAction } from '@/lib/supabase/submitAction';
import { classOf } from '@/lib/character/classes';
import { requestEquip, subscribeToInventory } from '@/lib/supabase/inventory';
import { itemLabel } from '@/lib/inventory/rules';
import { fetchPendingTrades, requestShop, requestTrade, subscribeToTrades, type TradeRow } from '@/lib/supabase/economy';
import type { TradeTerms } from '@/lib/economy/trade';
import { normalizeShop } from '@/lib/economy/shop';
import type { ShopState } from '@/lib/economy/apply';
import {
  subscribeToRoundActionCount,
  subscribeToCurrentRound,
  subscribeToCurrentScene,
  subscribeToCurrentShop,
  subscribeToCampaignStarted,
} from '@/lib/supabase/roundActionsRealtime';
import { startCampaignForClient } from '@/lib/supabase/startCampaign';
import { triggerRoundProcessing } from '@/lib/round/triggerRoundProcessing';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { fetchEncounter, subscribeToEncounter } from '@/lib/supabase/encounter';
import type { Encounter } from '@/lib/combat/encounter';
import { fetchCampaignFacts, subscribeToFacts } from '@/lib/supabase/factsRealtime';
import type { CampaignFact } from '@/lib/memory/types';

function CampaignPageContent({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId') ?? '';
  const [roundId, setRoundId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ acted: number; total: number } | null>(null);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [adventureId, setAdventureId] = useState<string | null>(null);
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [startedAt, setStartedAt] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  // Which round's timer has run out. Tying it to the round id stops an expired round from
  // auto-processing the next one in the render where the new round id arrives.
  const [timeUpRoundId, setTimeUpRoundId] = useState<string | null>(null);
  const [shop, setShop] = useState<ShopState | null>(null);
  // Synced only; the combat tracker UI reads it later.
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [restVote, setRestVote] = useState<RestVote | null>(null);
  const [shortRestsUsed, setShortRestsUsed] = useState(0);
  const [facts, setFacts] = useState<CampaignFact[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [shopError, setShopError] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const autoProcessedRound = useRef<string | null>(null);
  const [asksUsed, setAsksUsed] = useState(0);

  const triggerProcessing = useCallback((currentRoundId: string) => {
    setProcessing(true);
    triggerRoundProcessing(currentRoundId).finally(() => setProcessing(false));
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

    // Separate, tolerant query so a database without the economy columns still loads the campaign.
    supabaseBrowserClient
      .from('campaigns')
      .select('current_shop')
      .eq('id', campaignId)
      .maybeSingle()
      .then(({ data }) => setShop(normalizeShop(data?.current_shop)));
    const unsubscribeShop = subscribeToCurrentShop(campaignId, setShop);

    fetchEncounter(campaignId).then(setEncounter);
    const unsubscribeEncounter = subscribeToEncounter(campaignId, setEncounter);

    const refreshRest = () =>
      fetchRestState(campaignId, playerId).then((r) => {
        setRestVote(r.vote);
        setShortRestsUsed(r.shortRestsUsed);
      });
    refreshRest();
    const unsubscribeRest = subscribeToRestVote(campaignId, refreshRest);
    const unsubscribeRestPlayers = subscribeToPlayers(campaignId, refreshRest);

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
      unsubscribeShop();
      unsubscribeEncounter();
      unsubscribeRest();
      unsubscribeRestPlayers();
      unsubscribeSettings();
      unsubscribeStarted();
    };
  }, [campaignId, playerId]);

  // Built-in adventures resolve locally; a custom one is read from custom_adventures.
  useEffect(() => {
    if (!adventureId) {
      setAdventure(null);
      return;
    }
    let cancelled = false;
    getAdventureById(supabaseBrowserClient, adventureId)
      .then((found) => {
        if (!cancelled) setAdventure(found);
      })
      .catch(() => {
        // The title is cosmetic; failing to load it must never break the table.
      });
    return () => {
      cancelled = true;
    };
  }, [adventureId]);

  async function handleStart() {
    await startCampaignForClient(campaignId);
  }

  const refreshSeq = useRef(0);
  const refreshPlayers = useCallback(() => {
    // Refreshes overlap (realtime events fire in bursts at the end of a round). Only the latest
    // response may win, or a slow answer for the previous round could mark the player as
    // "already acted" in the new one and lock their action box.
    const seq = ++refreshSeq.current;
    fetchRoundPlayers(campaignId, roundId)
      .then((next) => {
        if (seq === refreshSeq.current) setPlayers(next);
      })
      .catch(() => {});
  }, [campaignId, roundId]);

  useEffect(() => {
    refreshPlayers();
    return subscribeToPlayers(campaignId, refreshPlayers);
  }, [campaignId, refreshPlayers, actionStatus?.acted]);

  useEffect(() => subscribeToInventory(campaignId, refreshPlayers), [campaignId, refreshPlayers]);

  const refreshTrades = useCallback(() => {
    fetchPendingTrades(campaignId)
      .then(setTrades)
      .catch(() => {});
  }, [campaignId]);
  useEffect(() => {
    refreshTrades();
    return subscribeToTrades(campaignId, refreshTrades);
  }, [campaignId, refreshTrades]);

  const refreshFacts = useCallback(() => {
    fetchCampaignFacts(campaignId)
      .then(setFacts)
      .catch(() => {});
  }, [campaignId]);
  useEffect(() => {
    refreshFacts();
    return subscribeToFacts(campaignId, refreshFacts);
  }, [campaignId, refreshFacts]);

  const me = players.find((p) => p.id === playerId);

  // Ask-the-DM quota resets every round. Count from messages when player_id exists, then follow local answers.
  useEffect(() => {
    setAsksUsed(0);
    if (!roundId || !playerId) return;
    let cancelled = false;
    fetchAskCount(campaignId, playerId, roundId).then((n) => {
      if (!cancelled) setAsksUsed((prev) => Math.max(prev, n));
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, playerId, roundId]);

  async function handleAsk(question: string) {
    try {
      await askDmForClient(campaignId, question);
      setAsksUsed((n) => n + 1);
    } catch (error) {
      if ((error as { status?: number }).status === 429) setAsksUsed(ASK_LIMIT);
      throw error;
    }
  }

  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.displayName]));

  function describeEconomyError(code: string): string {
    const known: Record<string, string> = {
      no_gold: 'เงินไม่พอ',
      full: 'กระเป๋าเต็ม',
      closed: 'ร้านปิดแล้ว',
      not_sold: 'ร้านนี้ไม่ขายของชิ้นนั้น',
      not_sellable: 'ของชิ้นนี้ขายให้ร้านไม่ได้',
      not_owned: 'คุณไม่มีของชิ้นนี้',
      missing_items: 'ของไม่ครบแล้ว',
      not_pending: 'ข้อเสนอนี้ไม่อยู่แล้ว',
      expired: 'ข้อเสนอหมดอายุ',
      too_many: 'มีข้อเสนอค้างเยอะเกินไป',
      conflict: 'มีคนแก้ไขกระเป๋าพร้อมกัน ลองใหม่อีกครั้ง',
    };
    return known[code] ?? 'ทำรายการไม่สำเร็จ';
  }

  async function handleBuy(itemId: string) {
    setShopError(null);
    try {
      await requestShop(campaignId, 'buy', itemId);
    } catch (error) {
      setShopError(describeEconomyError((error as Error).message));
    }
    refreshPlayers();
  }

  async function handleSell(itemId: string, customName: string) {
    setShopError(null);
    try {
      await requestShop(campaignId, 'sell', itemId, customName);
    } catch (error) {
      setShopError(describeEconomyError((error as Error).message));
    }
    refreshPlayers();
  }

  async function handlePropose(terms: { toPlayerId: string } & TradeTerms) {
    setTradeError(null);
    const { toPlayerId, ...rest } = terms;
    try {
      await requestTrade(campaignId, { action: 'propose', toPlayerId, terms: rest });
    } catch (error) {
      setTradeError(describeEconomyError((error as Error).message));
    }
    refreshTrades();
  }

  async function handleRespond(tradeId: string, action: 'accept' | 'decline' | 'cancel') {
    setTradeError(null);
    try {
      await requestTrade(campaignId, { action, tradeId });
    } catch (error) {
      setTradeError(describeEconomyError((error as Error).message));
    }
    refreshPlayers();
    refreshTrades();
  }

  async function handleEquip(itemId: string, action: 'equip' | 'unequip') {
    try {
      await requestEquip(campaignId, itemId, action);
    } catch {
      /* the refresh below puts the real state back on screen */
    }
    refreshPlayers();
  }

  async function handleAbilityChoice(choice: AbilityChoice) {
    await requestAbilityChoice(campaignId, choice);
    refreshPlayers();
  }

  async function handleRespawn(request: RespawnRequest) {
    await requestRespawn(campaignId, request);
    refreshPlayers();
  }

  async function handleDrink(itemId: string) {
    if (!roundId) return;
    const item = me?.items.find((i) => i.itemId === itemId);
    try {
      await submitAction(roundId, playerId, `ดื่ม${item ? itemLabel(item) : 'ยา'}`, itemId);
    } catch {
      /* the refresh below shows whether the action landed */
    }
    refreshPlayers();
  }

  const myClass = classOf(me?.classId);
  // K4: the mage casts spells instead of pressing a plain ability button; the arcane surge is a switch in the spell menu.
  const spellMenu =
    me && myClass?.id === 'mage'
      ? (() => {
          const max = mageSpellSlots(levelForXp(me.xp ?? 0));
          return {
            slotsLeft: max - Math.min(max, me.spellSlotsUsed ?? 0),
            slotsMax: max,
            list: SPELL_IDS.map((id) => ({ id, nameTh: SPELLS[id].nameTh, descTh: SPELLS[id].descTh, slots: SPELLS[id].slots, target: SPELLS[id].target })),
            enemies: (encounter?.enemies ?? []).filter((e) => e.pip > 0 && !e.fled).map((e) => e.name),
            allies: players.filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.displayName, isSelf: p.id === playerId })),
            surge: { nameTh: myClass.ability.nameTh, cooldown: me.abilityCooldown ?? 0 },
          };
        })()
      : undefined;

  async function handleCastSpell(spellId: string, target: { allyId?: string | null; enemy?: string | null }, surge: boolean) {
    if (!roundId) return;
    const spell = SPELLS[spellId as keyof typeof SPELLS];
    const targetName = target.enemy ?? players.find((p) => p.id === target.allyId)?.displayName;
    const text = `ร่าย${spell?.nameTh ?? 'เวท'}${targetName ? ` ใส่ ${targetName}` : ''}${surge ? ' ด้วยเวทไหลล้น' : ''}`;
    await submitAction(roundId, playerId, text, undefined, undefined, undefined, { spellId, targetId: target.allyId, enemy: target.enemy, surge });
    refreshPlayers();
  }

  const abilityProp = myClass && myClass.id !== 'mage'
    ? {
        nameTh: myClass.ability.nameTh,
        target: myClass.ability.target,
        cooldown: me?.abilityCooldown ?? 0,
        allies: players
          .filter((p) => p.status === 'active' && (p.id !== playerId || myClass.ability.target === 'ally_or_self'))
          // A heal on someone at full health would waste the ability, so only hurt players are offered.
          .filter((p) => myClass.id !== 'cleric' || p.hp < p.maxHp)
          .map((p) => ({ id: p.id, name: p.displayName })),
        noTargetText: myClass.id === 'cleric' ? 'ไม่มีใครบาดเจ็บ' : undefined,
      }
    : undefined;

  async function handleUseAbility(targetId: string | null) {
    if (!roundId || !myClass) return;
    const targetName = players.find((p) => p.id === targetId)?.displayName;
    const verb = myClass.id === 'warrior' ? 'ปกป้อง' : 'ให้';
    const text = `ใช้${myClass.ability.nameTh}${targetName ? ` ${verb} ${targetName}` : ''}`;
    await submitAction(roundId, playerId, text, undefined, { targetId });
    refreshPlayers();
  }

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
    setTimeUpRoundId(null);
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
    if (!roundId || timeUpRoundId !== roundId || processing || settings.roundSeconds === 0) return;
    if ((actionStatus?.acted ?? 0) > 0 && autoProcessedRound.current !== roundId) {
      autoProcessedRound.current = roundId;
      triggerProcessing(roundId);
    }
  }, [roundId, timeUpRoundId, processing, settings.roundSeconds, actionStatus?.acted, triggerProcessing]);

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
            playerNames={playerNames}
          />
          {processing && (
            <div className="thinking" role="status" aria-live="polite">
              <span className="d20">
                <D20Icon />
              </span>
              <span>DM กำลังเรียบเรียงเรื่องราว… อาจใช้เวลาสักครู่ (ยังไม่ค้าง)</span>
            </div>
          )}
          {me?.status === 'dead' && (
            <RespawnForm
              startLevel={respawnLevel(players.filter((p) => p.id !== playerId && p.status !== 'dead'))}
              onSubmit={handleRespawn}
            />
          )}
          {roundId && me?.status !== 'dead' && (
            <ActionInput
              key={roundId}
              onSubmit={(actionText) => submitAction(roundId, playerId, actionText)}
              ability={abilityProp}
              onUseAbility={handleUseAbility}
              spells={spellMenu}
              onCastSpell={handleCastSpell}
              disabledReason={
                players.find((p) => p.id === playerId)?.status === 'downed'
                  ? 'คุณล้มลง ทำ action ไม่ได้ รอเพื่อนช่วยพยุง'
                  : undefined
              }
              alreadyActed={me?.acted ?? false}
            />
          )}
          {roundId && me && me.status !== 'dead' && (
            <RestPanel
              vote={restVote}
              players={players}
              currentPlayerId={playerId}
              encounterActive={encounter !== null}
              shortRestsUsed={shortRestsUsed}
              isOwner={me.isOwner}
              onPropose={(kind: RestKind) => requestRest(campaignId, 'propose', kind)}
              onAgree={() => requestRest(campaignId, 'agree')}
              onCancel={() => requestRest(campaignId, 'cancel')}
            />
          )}
          {playerId && (
            <ChatPanel
              onSendChat={(content) => sendTeamChat(campaignId, content)}
              onAsk={handleAsk}
              asksUsed={asksUsed}
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
              onAbilityChoice={handleAbilityChoice}
              reorderPolicy={settings.reorderPolicy}
            />
          )}
          <EncounterPanel encounter={encounter} />
          {me && (
            <Inventory
              items={me.items}
              gold={me.gold}
              canAct={me.status === 'active' && !me.acted}
              fullHp={me.hp >= me.maxHp}
              onEquip={handleEquip}
              onDrink={handleDrink}
            />
          )}
          {shop && me && (
            <Shop shop={shop} items={me.items} gold={me.gold} onBuy={handleBuy} onSell={handleSell} error={shopError} />
          )}
          {me && (
            <Trades
              me={me}
              players={players}
              trades={trades}
              onPropose={handlePropose}
              onRespond={handleRespond}
              error={tradeError}
            />
          )}
          {roundId && settings.roundSeconds > 0 && (
            <RoundTimer
              openedAt={openedAt}
              durationMs={settings.roundSeconds * 1000}
              paused={processing}
              onExpire={() => setTimeUpRoundId(roundId)}
            />
          )}
          <CampaignSettingsPanel
            settings={settings}
            isOwner={players.find((p) => p.id === playerId)?.isOwner ?? false}
            started={Boolean(startedAt)}
            onSave={handleSaveSettings}
          />
          <QuestLog facts={facts} />
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
