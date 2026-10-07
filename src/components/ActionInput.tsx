'use client';

import { useState } from 'react';
import type { AbilityTarget } from '@/lib/character/classes';
import type { SpellTarget } from '@/lib/character/spells';

const QUICK_ACTIONS = ['โจมตี', 'เคลื่อนที่', 'พูดคุย', 'สำรวจรอบๆ'];

/** K4: what the mage's "ร่ายเวท" menu shows. */
export interface SpellMenu {
  slotsLeft: number;
  slotsMax: number;
  list: { id: string; nameTh: string; descTh: string; slots: 0 | 1; target: SpellTarget }[];
  /** Names of the enemies still fighting (empty = no fight, so enemy spells are off). */
  enemies: string[];
  /** Friends (and the caster) who can still act. */
  allies: { id: string; name: string; isSelf: boolean }[];
  /** The arcane surge: a free cast; `cooldown` is the eventful rounds left before it is ready. */
  surge?: { nameTh: string; cooldown: number };
}

export interface ActionInputProps {
  onSubmit: (actionText: string) => Promise<void>;
  /** When set the player cannot act (for example a downed character): everything is locked and this is shown. */
  disabledReason?: string;
  /** True when this player already has an action in this round (for example a potion drunk from the inventory). */
  alreadyActed?: boolean;
  /** The player's class ability; absent for classless players. */
  ability?: {
    nameTh: string;
    target: AbilityTarget;
    /** Eventful rounds left before it is ready; 0 means ready. */
    cooldown: number;
    /** Who can be picked as the target. */
    allies: { id: string; name: string }[];
    /** Shown instead of the default when nobody can be picked. */
    noTargetText?: string;
  };
  onUseAbility?: (targetId: string | null) => Promise<void>;
  /** K4: the mage's spell menu; absent for everyone else. */
  spells?: SpellMenu;
  onCastSpell?: (spellId: string, target: { allyId?: string | null; enemy?: string | null }, surge: boolean) => Promise<void>;
}

export function ActionInput({ onSubmit, disabledReason, alreadyActed, ability, onUseAbility, spells, onCastSpell }: ActionInputProps) {
  const [freeText, setFreeText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [casting, setCasting] = useState(false);
  const [spellChoice, setSpellChoice] = useState<string | null>(null);
  const [surge, setSurge] = useState(false);

  async function handleSubmit(actionText: string) {
    if (!actionText.trim() || submitted || submitting || disabledReason || alreadyActed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(actionText.trim());
      setSubmitted(true);
      setFreeText('');
    } catch {
      setError('ส่ง action ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  async function useAbility(targetId: string | null) {
    if (!onUseAbility || submitted || submitting || disabledReason || alreadyActed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onUseAbility(targetId);
      setSubmitted(true);
      setPicking(false);
    } catch {
      setError('ส่ง action ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  async function castSpell(spellId: string, target: { allyId?: string | null; enemy?: string | null }) {
    if (!onCastSpell || submitted || submitting || disabledReason || alreadyActed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCastSpell(spellId, target, surgeOn);
      setSubmitted(true);
      setCasting(false);
      setSpellChoice(null);
    } catch {
      setError('ส่ง action ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  function chooseSpell(id: string) {
    const spell = spells?.list.find((s) => s.id === id);
    if (!spell) return;
    if (spell.target === 'enemy' || spell.target === 'ally_or_self' || spell.target === 'ally') setSpellChoice(id);
    else void castSpell(id, {});
  }

  const surgeOn = surge && spells?.surge !== undefined && spells.surge.cooldown <= 0;
  const locked = submitted || submitting || Boolean(disabledReason) || Boolean(alreadyActed);

  return (
    <div className="dock">
      {disabledReason && <p className="down-note">{disabledReason}</p>}
      <div className="hint-row" role="group" aria-label="quick actions">
        <span className="lbl">เลือกเร็ว</span>
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="qa"
            disabled={locked}
            onClick={() => handleSubmit(action)}
          >
            {action}
          </button>
        ))}
        {ability && (
          <>
            <button
              type="button"
              className="qa ability"
              disabled={locked || ability.cooldown > 0}
              onClick={() => (ability.target ? setPicking((p) => !p) : useAbility(null))}
            >
              {ability.nameTh}
            </button>
            {ability.cooldown > 0 && (
              <>
                <span className="cd">อีก {ability.cooldown} รอบเหตุการณ์</span>
                <span className="cd">นับเฉพาะรอบที่มีเหตุการณ์เกิดขึ้น เช่น ถูกโจมตี ฟื้นฟู หรือได้ XP</span>
              </>
            )}
          </>
        )}
      </div>
      {spells && onCastSpell && (
        <div className="hint-row" role="group" aria-label="ร่ายเวท">
          <button
            type="button"
            className="qa ability"
            aria-expanded={casting}
            disabled={locked}
            onClick={() => {
              setCasting((c) => !c);
              setSpellChoice(null);
            }}
          >
            ร่ายเวท
          </button>
          <span className="cd">ช่องเวทเหลือ {spells.slotsLeft}/{spells.slotsMax}</span>
        </div>
      )}
      {spells && onCastSpell && casting && !locked && (
        <>
          {spells.surge && (
            <div className="hint-row">
              <label>
                <input
                  type="checkbox"
                  checked={surgeOn}
                  disabled={spells.surge.cooldown > 0}
                  onChange={(e) => setSurge(e.target.checked)}
                />{' '}
                ใช้{spells.surge.nameTh} (ร่ายฟรี ไม่เสียช่องเวท)
              </label>
              {spells.surge.cooldown > 0 && <span className="cd">อีก {spells.surge.cooldown} รอบเหตุการณ์</span>}
            </div>
          )}
          {!spellChoice && (
            <div className="hint-row" role="group" aria-label="เลือกเวท">
              <span className="lbl">เลือกเวท</span>
              {spells.list.map((spell) => {
                const free = spell.slots === 0 || surgeOn;
                const needsEnemy = spell.target === 'enemy' && spells.enemies.length === 0;
                const noSlot = !free && spells.slotsLeft < 1;
                return (
                  <button
                    key={spell.id}
                    type="button"
                    className="qa"
                    title={spell.descTh}
                    disabled={needsEnemy || noSlot}
                    onClick={() => chooseSpell(spell.id)}
                  >
                    {spell.nameTh} · {spell.slots === 0 ? 'ฟรี' : '1 ช่อง'}
                    {needsEnemy ? ' (ไม่มีศัตรู)' : noSlot ? ' (ช่องเวทหมด)' : ''}
                  </button>
                );
              })}
            </div>
          )}
          {spellChoice && (
            <div className="hint-row" role="group" aria-label="เลือกเป้าหมายของเวท">
              <span className="lbl">เลือกเป้าหมาย</span>
              {spells.list.find((s) => s.id === spellChoice)?.target === 'enemy'
                ? spells.enemies.map((name) => (
                    <button key={name} type="button" className="qa" onClick={() => castSpell(spellChoice, { enemy: name })}>
                      {name}
                    </button>
                  ))
                : spells.allies
                    .filter((a) => !(spells.list.find((s) => s.id === spellChoice)?.target === 'ally' && a.isSelf))
                    .map((a) => (
                      <button key={a.id} type="button" className="qa" onClick={() => castSpell(spellChoice, { allyId: a.id })}>
                        {a.isSelf ? `${a.name} (ตัวเอง)` : a.name}
                      </button>
                    ))}
              <button type="button" className="qa" onClick={() => setSpellChoice(null)}>
                เลือกเวทใหม่
              </button>
            </div>
          )}
        </>
      )}
      {ability && picking && !locked && (
        <div className="hint-row" role="group" aria-label="เลือกเป้าหมาย">
          <span className="lbl">เลือกเป้าหมาย</span>
          {ability.allies.length === 0 && <span className="cd">{ability.noTargetText ?? 'ไม่มีเพื่อนให้เลือก'}</span>}
          {ability.allies.map((ally) => (
            <button key={ally.id} type="button" className="qa" onClick={() => useAbility(ally.id)}>
              {ally.name}
            </button>
          ))}
        </div>
      )}
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(freeText);
        }}
      >
        <input
          aria-label="free text action"
          placeholder="หรือพิมพ์เอง เช่น “ค่อยๆ ย่องไปดูที่ท่าเรือ”"
          value={freeText}
          disabled={locked}
          onChange={(e) => setFreeText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={locked}>
          {submitting ? 'กำลังส่ง…' : 'ส่ง'}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {(submitted || alreadyActed) && <p className="status ok">ส่ง action แล้ว รอเพื่อนร่วมโต๊ะ…</p>}
    </div>
  );
}
