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

  it('animates a roll that arrives live before settling on the real number, but shows history instantly', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
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

      // Mid-tumble: shows the ticking placeholder, not the real result yet.
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.queryByText('20')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('20')).toBeInTheDocument();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('does not animate a roll message that was already in the history on load', async () => {
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
      />
    );

    await waitFor(() => expect(screen.getByText('20')).toBeInTheDocument());
  });

  it('skips the tumble animation when the player prefers reduced motion', async () => {
    const originalMatchMedia = window.matchMedia;
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: true });

    try {
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

      expect(screen.getByText('20')).toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
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
