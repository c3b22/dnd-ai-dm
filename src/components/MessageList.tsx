'use client';

import { useEffect, useRef, useState } from 'react';
import { D20Icon } from './D20Icon';
import { DiceRollOverlay, type DiceRollOverlayProps } from './DiceRollOverlay';

export interface Message {
  id: string;
  role: 'dm' | 'player' | 'system';
  content: string;
}

interface RollEntry {
  playerDisplayName: string;
  roll: number;
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
}

const ROLE_CLASS: Record<Message['role'], string> = {
  dm: 'msg dm',
  player: 'msg pl',
  system: 'msg system',
};

export function MessageList({
  campaignId,
  fetchInitialMessages,
  subscribeToNewMessages,
  RollOverlay = DiceRollOverlay,
}: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingRoll, setPendingRoll] = useState<{ messageId: string; values: number[] } | null>(
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
          setPendingRoll({ messageId: message.id, values: rolls.map((r) => r.roll) });
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
        <RollOverlay values={pendingRoll.values} onComplete={handleRollOverlayComplete} />
      )}
      <ul className="log" aria-label="session log" ref={listRef}>
        {messages.map((message) => {
          const rolls = message.role === 'system' ? parseRollMessage(message.content) : null;
          const stats = message.role === 'system' ? parseStatsMessage(message.content) : null;
          const pending = pendingRoll?.messageId === message.id;
          return (
            <li key={message.id} className={ROLE_CLASS[message.role]} data-role={message.role}>
              {message.role === 'dm' && <span className="who">DM</span>}
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
