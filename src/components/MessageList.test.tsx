import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MessageList } from './MessageList';

describe('MessageList', () => {
  it('renders the initial messages and appends live updates from the subscription', async () => {
    const fetchInitialMessages = vi
      .fn()
      .mockResolvedValue([{ id: 'm1', role: 'dm', content: 'You stand at the cave entrance.' }]);

    let deliverMessage: (message: any) => void = () => {};
    const subscribeToNewMessages = vi.fn((_campaignId, onMessage) => {
      deliverMessage = onMessage;
      return () => {};
    });

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    await waitFor(() =>
      expect(screen.getByText('You stand at the cave entrance.')).toBeInTheDocument()
    );

    act(() => {
      deliverMessage({ id: 'm2', role: 'player', content: 'I light a torch.' });
    });

    await waitFor(() => expect(screen.getByText('I light a torch.')).toBeInTheDocument());
  });

  it('updates a message in place instead of duplicating it when the same id streams again', async () => {
    const fetchInitialMessages = vi.fn().mockResolvedValue([]);
    let deliverMessage: (message: any) => void = () => {};
    const subscribeToNewMessages = vi.fn((_campaignId, onMessage) => {
      deliverMessage = onMessage;
      return () => {};
    });

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    act(() => {
      deliverMessage({ id: 'm1', role: 'dm', content: 'You see' });
    });
    await waitFor(() => expect(screen.getByText('You see')).toBeInTheDocument());

    act(() => {
      deliverMessage({ id: 'm1', role: 'dm', content: 'You see a torch.' });
    });
    await waitFor(() => expect(screen.getByText('You see a torch.')).toBeInTheDocument());
    expect(screen.queryByText('You see')).not.toBeInTheDocument();
  });
});
