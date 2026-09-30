'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowserClient } from '@/lib/supabase/client';
import { ensureAnonymousUser } from '@/lib/supabase/ensureAnonymousUser';
import { WeaponPicker } from '@/components/WeaponPicker';
import { DEFAULT_WEAPON_ID } from '@/lib/character/constants';

export default function JoinPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = use(params);
  const [displayName, setDisplayName] = useState('');
  const [weaponId, setWeaponId] = useState<string>(DEFAULT_WEAPON_ID);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleJoin() {
    setError(null);
    setJoining(true);
    try {
      const { user, error: authError } = await ensureAnonymousUser(supabaseBrowserClient);
      if (authError || !user) {
        setError('เข้าสู่ระบบไม่สำเร็จ ลองอีกครั้ง');
        return;
      }

      const response = await fetch(`/api/campaigns/${campaignId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, displayName, weaponId }),
      });
      if (!response.ok) {
        setError('เข้าร่วมแคมเปญไม่สำเร็จ ลองอีกครั้ง');
        return;
      }
      const player = await response.json();
      router.push(`/campaign/${campaignId}?playerId=${player.id}`);
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="screen" style={{ maxWidth: 460 }}>
      <h1 className="h-display" style={{ fontSize: 'clamp(24px, 5vw, 34px)' }}>
        เข้าร่วมโต๊ะผจญภัย
      </h1>
      <p className="lede">ตั้งชื่อตัวละครของคุณ แล้วเข้าไปนั่งที่โต๊ะได้เลย</p>
      <form
        className="panel"
        style={{ marginTop: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          handleJoin();
        }}
      >
        <div className="field">
          <label htmlFor="join-name">ชื่อตัวละครของคุณ</label>
          <input
            id="join-name"
            aria-label="display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <WeaponPicker value={weaponId} onChange={setWeaponId} />
        <button className="btn" type="submit" disabled={!displayName.trim() || joining}>
          {joining ? 'กำลังเข้าร่วม…' : 'เข้าร่วมแคมเปญ'}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
