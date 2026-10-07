'use client';

import { useEffect, useRef, useState } from 'react';
import type { MessageRole } from '@/lib/messages/roles';
import { D20Icon } from './D20Icon';
import { DiceRollOverlay, attackFormula, checkFormula, enemyAttackFormula, type DiceAttackView, type DiceCheckView, type DiceEnemyAttackView, type DiceRollOverlayProps } from './DiceRollOverlay';
import { skillLabel } from '@/lib/character/skillLabels';

export interface Message {
  id: string;
  role: MessageRole;
  player_id?: string | null;
  content: string;
}

interface RollEntry {
  playerDisplayName: string;
  roll: number;
  check?: { skill: string; dc: number; modifier: number; proficiency: number; total: number; success: boolean };
  /** I3: a player's attack on an enemy. */
  attack?: { target: string; modifier: number; proficiency: number; magic: number; total: number; ac: number; hit: boolean; critical: 'success' | 'failure' | null };
  /** I2: an enemy's attack on a player; `playerDisplayName` is the enemy. */
  enemyAttack?: { target: string; bonus: number; total: number; ac: number; hit: boolean; critical: 'success' | 'failure' | null };
}

function attackViews(rolls: RollEntry[]): DiceAttackView[] {
  return rolls.flatMap((r) => (r.attack ? [{ playerDisplayName: r.playerDisplayName, die: r.roll, ...r.attack }] : []));
}

function enemyAttackViews(rolls: RollEntry[]): DiceEnemyAttackView[] {
  return rolls.flatMap((r) => (r.enemyAttack ? [{ enemy: r.playerDisplayName, die: r.roll, ...r.enemyAttack }] : []));
}

function checkViews(rolls: RollEntry[]): DiceCheckView[] {
  return rolls.flatMap((r) => (r.check ? [{ playerDisplayName: r.playerDisplayName, die: r.roll, ...r.check }] : []));
}

function parseRollMessage(content: string): RollEntry[] | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'rolls' && Array.isArray(parsed.rolls)) {
      return parsed.rolls;
    }
  } catch {
    return null;
  }
  return null;
}

function parseStatsMessage(content: string): string[] | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type === 'stats' && Array.isArray(parsed.changes)) {
      return parsed.changes.filter((line: unknown): line is string => typeof line === 'string');
    }
  } catch {
    return null;
  }
  return null;
}

function RollSummary({ rolls, pending }: { rolls: RollEntry[]; pending: boolean }) {
  return (
    <ul className="roll-list">
      {rolls.map((r, i) => (
        <li
          key={i}
          className={
            `roll-line${pending ? ' pending' : ''}` +
            `${!pending && r.roll === 20 ? ' crit' : ''}` +
            `${!pending && r.roll === 1 ? ' fumble' : ''}`
          }
        >
          <span className="d20-mini">
            <D20Icon />
          </span>
          <span className="who">{r.playerDisplayName}</span>
          <span className="num">{pending ? '?' : r.roll}</span>
          {r.attack && !pending && (
            <span className={`check-detail ${r.attack.hit ? 'pass' : 'fail'}`}>
              → {r.attack.target} · {attackFormula({ die: r.roll, ...r.attack })} เทียบ AC {r.attack.ac} ·{' '}
              {r.attack.hit ? 'โดน' : 'พลาด'}
            </span>
          )}
          {r.enemyAttack && !pending && (
            <span className={`check-detail ${r.enemyAttack.hit ? 'fail' : 'pass'}`}>
              → {r.enemyAttack.target} · {enemyAttackFormula({ die: r.roll, ...r.enemyAttack })} เทียบ AC {r.enemyAttack.ac} ·{' '}
              {r.enemyAttack.hit ? 'โดน' : 'พลาด'}
            </span>
          )}
          {r.check && !pending && (
            <span className={`check-detail ${r.check.success ? 'pass' : 'fail'}`}>
              {skillLabel(r.check.skill)} DC {r.check.dc} · {checkFormula({ die: r.roll, ...r.check })} ·{' '}
              {r.check.success ? 'ผ่าน' : 'ไม่ผ่าน'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export interface MessageListProps {
  campaignId: string;
  fetchInitialMessages: (campaignId: string) => Promise<Message[]>;
  subscribeToNewMessages: (
    campaignId: string,
    onMessage: (message: Message) => void
  ) => () => void;
  RollOverlay?: (props: DiceRollOverlayProps) => React.ReactNode;
  /** playerId -> display name, used to label team chat and questions. Optional. */
  playerNames?: Record<string, string>;
}

const ROLE_CLASS: Record<Message['role'], string> = {
  dm: 'msg dm',
  player: 'msg pl',
  system: 'msg system',
  ooc: 'msg ooc',
  ask: 'msg ask',
  ask_answer: 'msg ask-answer',
};

function speakerName(message: Message, names?: Record<string, string>): string {
  return (message.player_id && names?.[message.player_id]) || '';
}

export function MessageList({
  campaignId,
  fetchInitialMessages,
  subscribeToNewMessages,
  RollOverlay = DiceRollOverlay,
  playerNames,
}: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingRoll, setPendingRoll] = useState<{ messageId: string; values: number[]; checks: DiceCheckView[]; attacks: DiceAttackView[]; enemyAttacks: DiceEnemyAttackView[] } | null>(
    null
  );
  const listRef = useRef<HTMLUListElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const pendingRollIdRef = useRef<string | null>(null);
  const bufferedRef = useRef<Map<string, Message>>(new Map());

  function applyMessage(message: Message) {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((m) => m.id === message.id);
      if (existingIndex === -1) return [...prev, message];
      const next = [...prev];
      next[existingIndex] = message;
      return next;
    });
  }

  function handleRollOverlayComplete() {
    pendingRollIdRef.current = null;
    setPendingRoll(null);
    for (const message of bufferedRef.current.values()) applyMessage(message);
    bufferedRef.current.clear();
  }

  useEffect(() => {
    let cancelled = false;
    fetchInitialMessages(campaignId).then((initial) => {
      if (cancelled) return;
      initial.forEach((m) => knownIdsRef.current.add(m.id));
      setMessages(initial);
    });

    const unsubscribe = subscribeToNewMessages(campaignId, (message) => {
      const isNew = !knownIdsRef.current.has(message.id);
      knownIdsRef.current.add(message.id);

      if (isNew && message.role === 'system') {
        const rolls = parseRollMessage(message.content);
        if (rolls && rolls.length > 0) {
          pendingRollIdRef.current = message.id;
          setPendingRoll({ messageId: message.id, values: rolls.map((r) => r.roll), checks: checkViews(rolls), attacks: attackViews(rolls), enemyAttacks: enemyAttackViews(rolls) });
        }
      }

      // Hold back anything else that arrives while the dice are tumbling, so the
      // DM's response doesn't reveal itself behind the overlay before it lands.
      if (pendingRollIdRef.current !== null && message.id !== pendingRollIdRef.current) {
        bufferedRef.current.set(message.id, message);
        return;
      }

      applyMessage(message);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [campaignId, fetchInitialMessages, subscribeToNewMessages]);

  // Keep the newest narration in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <>
      {pendingRoll && (
        <RollOverlay values={pendingRoll.values} checks={pendingRoll.checks} attacks={pendingRoll.attacks} enemyAttacks={pendingRoll.enemyAttacks} onComplete={handleRollOverlayComplete} />
      )}
      <ul className="log" aria-label="session log" ref={listRef}>
        {messages.map((message) => {
          const rolls = message.role === 'system' ? parseRollMessage(message.content) : null;
          const stats = message.role === 'system' ? parseStatsMessage(message.content) : null;
          const pending = pendingRoll?.messageId === message.id;
          return (
            <li key={message.id} className={ROLE_CLASS[message.role]} data-role={message.role}>
              {message.role === 'dm' && <span className="who">DM</span>}
              {message.role === 'ooc' && (
                <span className="who">
                  แชททีม{speakerName(message, playerNames) ? ` · ${speakerName(message, playerNames)}` : ''}
                </span>
              )}
              {message.role === 'ask' && (
                <span className="who">
                  ถาม DM{speakerName(message, playerNames) ? ` · ${speakerName(message, playerNames)}` : ''}
                </span>
              )}
              {message.role === 'ask_answer' && <span className="who">DM ตอบ (นอกเนื้อเรื่อง)</span>}
              {rolls ? (
                <RollSummary rolls={rolls} pending={pending} />
              ) : stats ? (
                <ul className="stat-list">
                  {stats.map((line, i) => (
                    <li key={i} className="stat-line">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <span>{message.content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
