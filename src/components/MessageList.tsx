'use client';

import { useEffect, useRef, useState } from 'react';

export interface Message {
  id: string;
  role: 'dm' | 'player' | 'system';
  content: string;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInitialMessages(campaignId).then((initial) => {
      if (!cancelled) setMessages(initial);
    });

    const unsubscribe = subscribeToNewMessages(campaignId, (message) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === message.id);
        if (existingIndex === -1) return [...prev, message];
        const next = [...prev];
        next[existingIndex] = message;
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
      {messages.map((message) => (
        <li key={message.id} className={ROLE_CLASS[message.role]} data-role={message.role}>
          {message.role === 'dm' && <span className="who">DM</span>}
          <span>{message.content}</span>
        </li>
      ))}
    </ul>
  );
}
