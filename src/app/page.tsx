'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ADVENTURES } from '@/lib/adventures/adventures';
import { openingSceneId } from '@/lib/scenes/scenes';
import { D20Icon } from '@/components/D20Icon';
import { MyCampaigns } from '@/components/MyCampaigns';
import { MyAdventures, type MyAdventureSummary } from '@/components/MyAdventures';
import { WeaponPicker } from '@/components/WeaponPicker';
import { DEFAULT_WEAPON_ID } from '@/lib/character/constants';
import type { MyCampaignSummary } from '@/lib/campaign/myCampaigns';

function sceneUrl(adventureId: string) {
  return `/scenes/${openingSceneId(adventureId)}.jpg`;
}

export default function Home() {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adventureId, setAdventureId] = useState(ADVENTURES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [weaponId, setWeaponId] = useState<string>(DEFAULT_WEAPON_ID);
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollText, setRollText] = useState('');
  const [myCampaigns, setMyCampaigns] = useState<MyCampaignSummary[]>([]);
  const [myAdventures, setMyAdventures] = useState<MyAdventureSummary[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const pickerItems = [
    ...ADVENTURES.map((a) => ({ id: a.id, titleTh: a.titleTh, taglineTh: a.taglineTh, toneTh: a.toneTh, thumbnailUrl: sceneUrl(a.id) })),
    ...myAdventures.map((a) => ({ id: a.id, titleTh: a.titleTh, taglineTh: a.taglineTh, toneTh: '', thumbnailUrl: a.thumbnailUrl })),
  ];
  const picked = pickerItems.find((a) => a.id === adventureId) ?? pickerItems[0];

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let supabaseBrowserClient: Awaited<typeof import('@/lib/supabase/client')>['supabaseBrowserClient'] | undefined;
      let userId: string | undefined;
      let accessToken: string | undefined;
      try {
        // Loaded here, not at module scope: this page is statically prerendered at build
        // time, and creating the Supabase client there would require its keys during `next build`.
        ({ supabaseBrowserClient } = await import('@/lib/supabase/client'));
        // Only reads an existing session: a first-time visitor is not signed in just to see this list.
        const { data } = await supabaseBrowserClient.auth.getSession();
        userId = data.session?.user.id;
        accessToken = data.session?.access_token;
      } catch {
        // Both lists below are a convenience; failing to even load the session must never break the page.
      }
      if (!userId || !supabaseBrowserClient) return;
      try {
        const { fetchMyCampaigns } = await import('@/lib/campaign/myCampaigns');
        const campaigns = await fetchMyCampaigns(supabaseBrowserClient, userId);
        if (!cancelled) setMyCampaigns(campaigns);
      } catch {
        // The list is a convenience; failing to load it must never break creating or joining a game.
      }
      try {
        const response = await fetch('/api/adventures/mine', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setMyAdventures(body.adventures);
      } catch {
        // The list is a convenience; failing to load it must never break creating or joining a game.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function rollForAdventure() {
    if (rolling) return;
    setRolling(true);
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks += 1;
      setRollText(String(1 + Math.floor(Math.random() * 20)));
      setAdventureId(ADVENTURES[ticks % ADVENTURES.length].id);
      if (ticks >= 12) {
        if (timer.current) clearInterval(timer.current);
        const roll = 1 + Math.floor(Math.random() * 20);
        const picked = ADVENTURES[(roll - 1) % ADVENTURES.length];
        setAdventureId(picked.id);
        setRollText(`${roll} → ${picked.titleTh}`);
        setRolling(false);
      }
    }, 110);
  }

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      // Loaded on click, not at module scope: this page is statically prerendered at build
      // time, and creating the Supabase client there would require its keys during `next build`.
      const { supabaseBrowserClient } = await import('@/lib/supabase/client');
      const { ensureAnonymousUser } = await import('@/lib/supabase/ensureAnonymousUser');
      const { user, error: authError } = await ensureAnonymousUser(supabaseBrowserClient);
      if (authError || !user) {
        setError('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง');
        return;
      }

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userId: user.id, displayName, adventureId, weaponId }),
      });
      if (!response.ok) {
        setError('สร้างแคมเปญไม่สำเร็จ ลองอีกครั้ง');
        return;
      }
      const { campaign, player } = await response.json();
      router.push(`/campaign/${campaign.id}?playerId=${player.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinByCode() {
    setJoinError(null);
    setJoiningByCode(true);
    try {
      const response = await fetch('/api/campaigns/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode }),
      });
      const body = await response.json();
      if (!response.ok) {
        setJoinError(body.error ?? 'ไม่พบห้องนี้ ตรวจสอบรหัสอีกครั้ง');
        return;
      }
      router.push(`/join/${body.campaignId}`);
    } finally {
      setJoiningByCode(false);
    }
  }

  return (
    <main className="screen">
      <div className="hero">
        <div className="hero-die">
          <D20Icon />
        </div>
        <div>
          <h1 className="h-display" style={{ fontSize: 'clamp(26px, 5vw, 40px)' }}>
            เลือกการผจญภัยของคุณ
          </h1>
          <p className="lede">
            DM ที่เป็น AI จะเล่าเรื่องตามโครงเรื่องที่คุณเลือก และปรับตามการตัดสินใจของผู้เล่นทุกคนในโต๊ะ
          </p>
        </div>
      </div>
      <MyCampaigns campaigns={myCampaigns} />
      <MyAdventures adventures={myAdventures} />
      <Link href="/adventures/new" className="btn ghost">+ สร้างเนื้อเรื่องใหม่</Link>
      <div className="roll-row">
        <button type="button" className="btn ghost" onClick={rollForAdventure} disabled={rolling}>
          ทอยเต๋าสุ่มเรื่อง
        </button>
        <span className="num" aria-live="polite">
          {rollText}
        </span>
      </div>

      <div className="home-grid">
        <fieldset className="adv-list">
          <legend className="lede" style={{ marginBottom: 8 }}>
            เนื้อเรื่อง
          </legend>
          {pickerItems.map((a) => (
            <button
              key={a.id}
              type="button"
              className="adv"
              aria-pressed={adventureId === a.id}
              onClick={() => setAdventureId(a.id)}
            >
              <span className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbnailUrl ?? ''} alt="" />
              </span>
              <span className="t">{a.titleTh}</span>
              <span className="d">{a.taglineTh}</span>
              {a.toneTh && (
                <span className="chips">
                  <span className="chip">{a.toneTh}</span>
                </span>
              )}
            </button>
          ))}
        </fieldset>

        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <div className="preview-art" key={picked.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={picked.thumbnailUrl ?? ''} alt={`ภาพฉากเปิดเรื่อง ${picked.titleTh}`} />
          </div>
          {ADVENTURES.some((a) => a.id === picked.id) ? (
            <div className="preview-hook">
              {(ADVENTURES.find((a) => a.id === picked.id) ?? ADVENTURES[0]).openingTh.split('...')[0].slice(0, 150)}…
            </div>
          ) : (
            <div className="preview-hook">{picked.taglineTh}</div>
          )}
          <div className="field">
            <label htmlFor="campaign-name">ชื่อแคมเปญ</label>
            <input
              id="campaign-name"
              aria-label="campaign name"
              placeholder="เช่น ค่ำคืนแรกที่ทะเลสาบ"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="display-name">ชื่อตัวละครของคุณ</label>
            <input
              id="display-name"
              aria-label="display name"
              placeholder="ชื่อที่จะแสดงในโต๊ะ"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <WeaponPicker value={weaponId} onChange={setWeaponId} />
          <button className="btn" type="submit" disabled={!name.trim() || !displayName.trim() || creating}>
            {creating ? 'กำลังสร้าง…' : 'เริ่มผจญภัย'}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </div>

      <form
        className="panel join-by-code"
        onSubmit={(e) => {
          e.preventDefault();
          handleJoinByCode();
        }}
      >
        <div className="field">
          <label htmlFor="join-code-input">มีรหัสห้องจากเพื่อนแล้ว?</label>
          <input
            id="join-code-input"
            aria-label="join code"
            placeholder="กรอกรหัสห้อง 6 หลัก"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
        </div>
        <button className="btn ghost" type="submit" disabled={!joinCode.trim() || joiningByCode}>
          {joiningByCode ? 'กำลังค้นหา…' : 'เข้าร่วมห้อง'}
        </button>
        {joinError && (
          <p role="alert" className="error">
            {joinError}
          </p>
        )}
      </form>
    </main>
  );
}
