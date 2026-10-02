'use client';

import { useState } from 'react';
import type { TradeRow } from '@/lib/supabase/economy';
import type { RoundPlayer } from '@/lib/supabase/players';
import { TRADE_TTL_MS, type TradeItem, type TradeTerms } from '@/lib/economy/trade';
import { itemLabel } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';

export interface TradesProps {
  me: RoundPlayer;
  players: RoundPlayer[];
  trades: TradeRow[];
  onPropose: (terms: { toPlayerId: string } & TradeTerms) => void;
  onRespond: (tradeId: string, action: 'accept' | 'decline' | 'cancel') => void;
  error?: string | null;
}

const keyOf = (i: { itemId: string; customName: string }) => `${i.itemId}|${i.customName}`;
const toGold = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

function describeSide(items: TradeItem[], gold: number): string {
  const parts = [
    ...items.map((i) => `${itemLabel(i)}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`),
    ...(gold > 0 ? [`${gold} ทอง`] : []),
  ];
  return parts.length ? parts.join(', ') : 'ไม่มีอะไร';
}

function pick(items: InventoryItem[], keys: string[]): TradeItem[] {
  return items.filter((i) => keys.includes(keyOf(i))).map((i) => ({ itemId: i.itemId, customName: i.customName, quantity: 1 }));
}

export function Trades({ me, players, trades, onPropose, onRespond, error }: TradesProps) {
  const others = players.filter((p) => p.id !== me.id);
  const [toPlayerId, setToPlayerId] = useState('');
  const [give, setGive] = useState<string[]>([]);
  const [want, setWant] = useState<string[]>([]);
  const [giveGold, setGiveGold] = useState('');
  const [wantGold, setWantGold] = useState('');

  const partner = others.find((p) => p.id === (toPlayerId || others[0]?.id));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? '?';
  const toggle = (list: string[], setList: (next: string[]) => void, key: string) =>
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const empty = give.length === 0 && want.length === 0 && toGold(giveGold) === 0 && toGold(wantGold) === 0;

  function submit() {
    if (!partner || empty) return;
    onPropose({
      toPlayerId: partner.id,
      giveItems: pick(me.items, give),
      giveGold: toGold(giveGold),
      wantItems: pick(partner.items, want),
      wantGold: toGold(wantGold),
    });
    setGive([]);
    setWant([]);
    setGiveGold('');
    setWantGold('');
  }

  const incoming = trades.filter((t) => t.toPlayerId === me.id);
  const outgoing = trades.filter((t) => t.fromPlayerId === me.id);

  return (
    <section className="card" aria-label="แลกของ">
      <h3>แลกของ</h3>
      {others.length === 0 ? (
        <p className="status">ยังไม่มีเพื่อนให้แลกด้วย</p>
      ) : (
        <div className="trade-form">
          <select
            aria-label="คู่แลก"
            value={partner?.id ?? ''}
            onChange={(e) => {
              setToPlayerId(e.target.value);
              setWant([]);
            }}
          >
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <div className="trade-side">
            {me.items.map((i) => (
              <label key={keyOf(i)}>
                <input type="checkbox" aria-label={`ให้: ${itemLabel(i)}`} checked={give.includes(keyOf(i))} onChange={() => toggle(give, setGive, keyOf(i))} />{' '}
                {itemLabel(i)}
              </label>
            ))}
            <input type="number" min={0} aria-label="ทองที่ให้" placeholder="ทองที่ให้" value={giveGold} onChange={(e) => setGiveGold(e.target.value)} />
          </div>
          <div className="trade-side">
            {(partner?.items ?? []).map((i) => (
              <label key={keyOf(i)}>
                <input type="checkbox" aria-label={`ขอ: ${itemLabel(i)}`} checked={want.includes(keyOf(i))} onChange={() => toggle(want, setWant, keyOf(i))} />{' '}
                {itemLabel(i)}
              </label>
            ))}
            <input type="number" min={0} aria-label="ทองที่ขอ" placeholder="ทองที่ขอ" value={wantGold} onChange={(e) => setWantGold(e.target.value)} />
          </div>
          <button type="button" className="btn" disabled={empty} onClick={submit}>
            เสนอ
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {incoming.map((t) => {
        const expired = Date.now() - new Date(t.createdAt).getTime() > TRADE_TTL_MS;
        return (
          <div key={t.id} className="trade-row">
            <span>
              {nameOf(t.fromPlayerId)} เสนอ: ให้ {describeSide(t.giveItems, t.giveGold)} ขอ {describeSide(t.wantItems, t.wantGold)}
              {expired && <em> (หมดอายุ)</em>}
            </span>
            <span>
              {/* The server would refuse accept once expired anyway; don't offer a button that only fails. */}
              {!expired && (
                <button type="button" className="qa" onClick={() => onRespond(t.id, 'accept')}>ตกลง</button>
              )}{' '}
              <button type="button" className="qa" onClick={() => onRespond(t.id, 'decline')}>ปฏิเสธ</button>
            </span>
          </div>
        );
      })}
      {outgoing.map((t) => (
        <div key={t.id} className="trade-row">
          <span>
            คุณเสนอให้ {nameOf(t.toPlayerId)}: ให้ {describeSide(t.giveItems, t.giveGold)} ขอ {describeSide(t.wantItems, t.wantGold)}
          </span>
          <button type="button" className="qa" onClick={() => onRespond(t.id, 'cancel')}>ยกเลิก</button>
        </div>
      ))}
    </section>
  );
}
