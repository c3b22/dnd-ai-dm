'use client';

import { useEffect, useState } from 'react';

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

export function MessageList({
  campaignId,
  fetchInitialMessages,
  subscribeToNewMessages,
}: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);

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

  return (
    <ul aria-label="session log">
      {messages.map((message) => (
        <li key={message.id} data-role={message.role}>
          {message.content}
        </li>
      ))}
    </ul>
  );
}
