'use client';

import { useEffect, useRef, useState } from 'react';
import { D20Icon } from './D20Icon';

export interface Message {
  id: string;
  role: 'dm' | 'player' | 'system';
  content: string;
}

interface DisplayMessage extends Message {
  live: boolean;
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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Settles roughly a second after the round resolves, staggered so simultaneous
// rolls clatter to a stop one after another instead of snapping at once.
const TUMBLE_BASE_MS = 550;
const TUMBLE_STAGGER_MS = 150;
const TUMBLE_TICK_MS = 80;

function RollDie({ entry, delayMs, animate }: { entry: RollEntry; delayMs: number; animate: boolean }) {
  const [display, setDisplay] = useState(animate ? 1 : entry.roll);
  const [landed, setLanded] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const tickId = setInterval(() => {
      setDisplay(1 + Math.floor(Math.random() * 20));
    }, TUMBLE_TICK_MS);
    const settleId = setTimeout(() => {
      clearInterval(tickId);
      setDisplay(entry.roll);
      setLanded(true);
    }, TUMBLE_BASE_MS + delayMs);
    return () => {
      clearInterval(tickId);
      clearTimeout(settleId);
    };
    // Runs once per mount: this die tumbles exactly once when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cls =
    `roll-line${!landed ? ' rolling' : ''}` +
    `${landed && entry.roll === 20 ? ' crit' : ''}` +
    `${landed && entry.roll === 1 ? ' fumble' : ''}`;

  return (
    <li className={cls}>
      <span className="d20-mini">
        <D20Icon />
      </span>
      <span className="who">{entry.playerDisplayName}</span>
      <span className="num">{display}</span>
    </li>
  );
}

function RollSummary({ rolls, live }: { rolls: RollEntry[]; live: boolean }) {
  const animate = live && !prefersReducedMotion();
  return (
    <ul className="roll-list">
      {rolls.map((r, i) => (
        <RollDie key={i} entry={r} delayMs={i * TUMBLE_STAGGER_MS} animate={animate} />
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
}: MessageListProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInitialMessages(campaignId).then((initial) => {
      if (!cancelled) setMessages(initial.map((m) => ({ ...m, live: false })));
    });

    const unsubscribe = subscribeToNewMessages(campaignId, (message) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === message.id);
        if (existingIndex === -1) return [...prev, { ...message, live: true }];
        const next = [...prev];
        next[existingIndex] = { ...message, live: next[existingIndex].live };
        return next;
      });
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
    <ul className="log" aria-label="session log" ref={listRef}>
      {messages.map((message) => {
        const rolls = message.role === 'system' ? parseRollMessage(message.content) : null;
        return (
          <li key={message.id} className={ROLE_CLASS[message.role]} data-role={message.role}>
            {message.role === 'dm' && <span className="who">DM</span>}
            {rolls ? <RollSummary rolls={rolls} live={message.live} /> : <span>{message.content}</span>}
          </li>
        );
      })}
    </ul>
  );
}
