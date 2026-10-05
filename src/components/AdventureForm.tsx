'use client';

import { useState } from 'react';
import { supabaseBrowserClient } from '@/lib/supabase/client';

// Duplicated from src/lib/adventures/customAdventures.ts: that module pulls in
// server-only Supabase types, so this client component keeps its own copy.
export interface CustomScene {
  key: string;
  nameTh: string;
  imagePath: string | null;
}

export interface CustomAdventureInput {
  title: string;
  titleTh: string;
  tagline: string;
  taglineTh: string;
  tone: string;
  toneTh: string;
  setting: string;
  hook: string;
  openingTh: string;
  secret: string;
  acts: string[];
  npcs: { name: string; role: string }[];
}

export interface AdventureFormProps {
  existing?: CustomAdventureInput & { id: string; scenes: CustomScene[] };
}

const EMPTY_NPC = { name: '', role: '' };

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowserClient.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

export function AdventureForm({ existing }: AdventureFormProps) {
  const [adventureId, setAdventureId] = useState<string | null>(existing?.id ?? null);
  const [scenes, setScenes] = useState<CustomScene[]>(existing?.scenes ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [titleTh, setTitleTh] = useState(existing?.titleTh ?? '');
  const [tagline, setTagline] = useState(existing?.tagline ?? '');
  const [taglineTh, setTaglineTh] = useState(existing?.taglineTh ?? '');
  const [tone, setTone] = useState(existing?.tone ?? '');
  const [toneTh, setToneTh] = useState(existing?.toneTh ?? '');
  const [setting, setSetting] = useState(existing?.setting ?? '');
  const [hook, setHook] = useState(existing?.hook ?? '');
  const [openingTh, setOpeningTh] = useState(existing?.openingTh ?? '');
  const [secret, setSecret] = useState(existing?.secret ?? '');
  const [acts, setActs] = useState<string[]>(existing?.acts ?? ['']);
  const [npcs, setNpcs] = useState<{ name: string; role: string }[]>(existing?.npcs ?? []);

  function addAct() {
    setActs((prev) => [...prev, '']);
  }

  function removeAct(index: number) {
    setActs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAct(index: number, value: string) {
    setActs((prev) => prev.map((act, i) => (i === index ? value : act)));
  }

  function addNpc() {
    setNpcs((prev) => [...prev, { ...EMPTY_NPC }]);
  }

  function removeNpc(index: number) {
    setNpcs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateNpc(index: number, field: 'name' | 'role', value: string) {
    setNpcs((prev) => prev.map((npc, i) => (i === index ? { ...npc, [field]: value } : npc)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input: CustomAdventureInput = {
        title, titleTh, tagline, taglineTh, tone, toneTh,
        setting, hook, openingTh, secret, acts,
        npcs: npcs.filter((npc) => npc.name.trim() !== '' || npc.role.trim() !== ''),
      };
      const url = adventureId ? `/api/adventures/${adventureId}` : '/api/adventures';
      const method = adventureId ? 'PATCH' : 'POST';
      const headers = await authHeader();
      const response = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'ไม่สามารถบันทึกเนื้อเรื่องได้');
      }
      const result = await response.json();
      setAdventureId(result.id);
      setScenes(result.scenes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกเนื้อเรื่องได้');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImageChange(key: string, file: File) {
    if (!adventureId) return;
    const headers = await authHeader();
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`/api/adventures/${adventureId}/scenes/${key}/image`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) return;
    const body = await response.json();
    setScenes((prev) => prev.map((scene) => (scene.key === key ? { ...scene, imagePath: body.imageUrl } : scene)));
  }

  return (
    <form className="panel adventure-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="adv-title-th">ชื่อเรื่อง (ไทย)</label>
        <input id="adv-title-th" value={titleTh} onChange={(e) => setTitleTh(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-title-en">ชื่อเรื่อง (อังกฤษ)</label>
        <input id="adv-title-en" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-tagline-th">แทกไลน์ (ไทย)</label>
        <input id="adv-tagline-th" value={taglineTh} onChange={(e) => setTaglineTh(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-tagline-en">แทกไลน์ (อังกฤษ)</label>
        <input id="adv-tagline-en" value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-tone-th">อารมณ์เรื่อง (ไทย)</label>
        <input id="adv-tone-th" value={toneTh} onChange={(e) => setToneTh(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-tone-en">อารมณ์เรื่อง (อังกฤษ)</label>
        <input id="adv-tone-en" value={tone} onChange={(e) => setTone(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-setting">ฉาก (อังกฤษ)</label>
        <input id="adv-setting" value={setting} onChange={(e) => setSetting(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-hook">จุดเกี่ยว (อังกฤษ)</label>
        <input id="adv-hook" value={hook} onChange={(e) => setHook(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-opening-th">บทเปิดเรื่อง (ไทย)</label>
        <textarea id="adv-opening-th" value={openingTh} onChange={(e) => setOpeningTh(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="adv-secret">ความลับ (อังกฤษ)</label>
        <textarea id="adv-secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
      </div>

      <fieldset className="adv-acts">
        <legend>องก์ของเรื่อง</legend>
        {acts.map((act, i) => (
          <div className="field adv-act-row" key={i}>
            <label htmlFor={`adv-act-${i}`}>{`องก์ที่ ${i + 1}`}</label>
            <input id={`adv-act-${i}`} value={act} onChange={(e) => updateAct(i, e.target.value)} />
            <button type="button" onClick={() => removeAct(i)}>ลบ</button>
          </div>
        ))}
        <button type="button" onClick={addAct}>+ เพิ่มองก์</button>
      </fieldset>

      <fieldset className="adv-npcs">
        <legend>ตัวละคร NPC</legend>
        {npcs.map((npc, i) => (
          <div className="field adv-npc-row" key={i}>
            <label htmlFor={`adv-npc-name-${i}`}>{`ชื่อ NPC ${i + 1}`}</label>
            <input id={`adv-npc-name-${i}`} value={npc.name} onChange={(e) => updateNpc(i, 'name', e.target.value)} />
            <label htmlFor={`adv-npc-role-${i}`}>{`บทบาท NPC ${i + 1}`}</label>
            <input id={`adv-npc-role-${i}`} value={npc.role} onChange={(e) => updateNpc(i, 'role', e.target.value)} />
            <button type="button" onClick={() => removeNpc(i)}>ลบ</button>
          </div>
        ))}
        <button type="button" onClick={addNpc}>+ เพิ่ม NPC</button>
      </fieldset>

      {scenes.length > 0 && (
        <fieldset className="adv-scenes">
          <legend>ภาพประกอบแต่ละฉาก</legend>
          {scenes.map((scene) => (
            <div className="field" key={scene.key}>
              <label htmlFor={`scene-image-${scene.key}`}>{scene.nameTh}</label>
              {scene.imagePath && <img src={scene.imagePath} alt={scene.nameTh} />}
              <input
                id={`scene-image-${scene.key}`}
                aria-label={scene.nameTh}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageChange(scene.key, file);
                }}
              />
            </div>
          ))}
        </fieldset>
      )}

      {error && <p className="error">{error}</p>}
      <button type="submit" className="adv" disabled={submitting}>
        {adventureId ? 'บันทึก' : 'สร้างเนื้อเรื่อง'}
      </button>
    </form>
  );
}
