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

  it('renders a structured roll message as one row per roll', async () => {
    const fetchInitialMessages = vi.fn().mockResolvedValue([
      {
        id: 'm1',
        role: 'system',
        content: JSON.stringify({
          type: 'rolls',
          rolls: [
            { playerDisplayName: 'Prem', roll: 20 },
            { playerDisplayName: 'Nueng', roll: 1 },
          ],
        }),
      },
    ]);
    const subscribeToNewMessages = vi.fn(() => () => {});

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    await waitFor(() => expect(screen.getByText('Prem')).toBeInTheDocument());
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Nueng')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('hides the numbers behind a placeholder while the roll overlay plays, then reveals them once it completes', async () => {
    let triggerComplete: () => void = () => {};
    function FakeOverlay({ onComplete }: { values: number[]; onComplete: () => void }) {
      triggerComplete = onComplete;
      return null;
    }

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
        RollOverlay={FakeOverlay}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverMessage({
        id: 'm1',
        role: 'system',
        content: JSON.stringify({ type: 'rolls', rolls: [{ playerDisplayName: 'Prem', roll: 20 }] }),
      });
    });

    expect(screen.getByText('Prem')).toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();

    act(() => {
      triggerComplete();
    });

    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('defers other messages that arrive while the roll overlay is playing, then reveals them together once it completes', async () => {
    let triggerComplete: () => void = () => {};
    function FakeOverlay({ onComplete }: { values: number[]; onComplete: () => void }) {
      triggerComplete = onComplete;
      return null;
    }

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
        RollOverlay={FakeOverlay}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      deliverMessage({
        id: 'm1',
        role: 'system',
        content: JSON.stringify({ type: 'rolls', rolls: [{ playerDisplayName: 'Prem', roll: 20 }] }),
      });
    });

    // DM narration starts streaming in while the dice are still tumbling.
    act(() => {
      deliverMessage({ id: 'm2', role: 'dm', content: 'The door creaks open' });
    });
    act(() => {
      deliverMessage({ id: 'm2', role: 'dm', content: 'The door creaks open slowly.' });
    });

    expect(screen.queryByText(/The door creaks/)).not.toBeInTheDocument();

    act(() => {
      triggerComplete();
    });

    expect(screen.getByText('The door creaks open slowly.')).toBeInTheDocument();
  });

  it('never shows the roll overlay for history that was already loaded on mount', async () => {
    const fakeOverlay = vi.fn(() => null);
    const fetchInitialMessages = vi.fn().mockResolvedValue([
      {
        id: 'm1',
        role: 'system',
        content: JSON.stringify({ type: 'rolls', rolls: [{ playerDisplayName: 'Prem', roll: 20 }] }),
      },
    ]);
    const subscribeToNewMessages = vi.fn(() => () => {});

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
        RollOverlay={fakeOverlay}
      />
    );

    await waitFor(() => expect(screen.getByText('20')).toBeInTheDocument());
    expect(fakeOverlay).not.toHaveBeenCalled();
  });

  it('renders a stats message as one line per change', async () => {
    const fetchInitialMessages = vi.fn().mockResolvedValue([
      {
        id: 'm1',
        role: 'system',
        content: JSON.stringify({ type: 'stats', changes: ['Prem −5 HP', 'Prem ล้มลง'] }),
      },
    ]);
    const subscribeToNewMessages = vi.fn(() => () => {});

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    await waitFor(() => expect(screen.getByText('Prem −5 HP')).toBeInTheDocument());
    expect(screen.getByText('Prem ล้มลง')).toBeInTheDocument();
  });

  it('falls back to plain text for a system message that is not structured roll data', async () => {
    const fetchInitialMessages = vi
      .fn()
      .mockResolvedValue([{ id: 'm1', role: 'system', content: 'ห้องถูกสร้างแล้ว' }]);
    const subscribeToNewMessages = vi.fn(() => () => {});

    render(
      <MessageList
        campaignId="camp-1"
        fetchInitialMessages={fetchInitialMessages}
        subscribeToNewMessages={subscribeToNewMessages}
      />
    );

    await waitFor(() => expect(screen.getByText('ห้องถูกสร้างแล้ว')).toBeInTheDocument());
  });
});
