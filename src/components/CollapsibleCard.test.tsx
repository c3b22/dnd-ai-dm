import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleCard } from './CollapsibleCard';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const toggle = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('CollapsibleCard', () => {
  it('is open by default and toggles with aria-expanded', () => {
    render(<CollapsibleCard id="a" title="กระเป๋า"><p>เนื้อหา</p></CollapsibleCard>);
    expect(toggle('กระเป๋า').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('เนื้อหา')).toBeTruthy();
    fireEvent.click(toggle('กระเป๋า'));
    expect(toggle('กระเป๋า').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('เนื้อหา')).toBeNull();
    fireEvent.click(toggle('กระเป๋า'));
    expect(screen.getByText('เนื้อหา')).toBeTruthy();
  });

  it('respects defaultOpen={false}', () => {
    render(<CollapsibleCard id="a" title="สมุด" defaultOpen={false}><p>x</p></CollapsibleCard>);
    expect(toggle('สมุด').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('x')).toBeNull();
  });

  it('remembers state per card id in localStorage', () => {
    const { unmount } = render(<CollapsibleCard id="a" title="A"><p>x</p></CollapsibleCard>);
    fireEvent.click(toggle('A'));
    unmount();
    render(<CollapsibleCard id="a" title="A"><p>x</p></CollapsibleCard>);
    expect(toggle('A').getAttribute('aria-expanded')).toBe('false');
    render(<CollapsibleCard id="b" title="B"><p>y</p></CollapsibleCard>);
    expect(toggle('B').getAttribute('aria-expanded')).toBe('true');
  });

  it('works normally when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render(<CollapsibleCard id="a" title="A" defaultOpen={false}><p>x</p></CollapsibleCard>);
    expect(toggle('A').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle('A'));
    expect(toggle('A').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('x')).toBeTruthy();
  });

  it('renders nothing when not visible, keeping state for later', () => {
    const { rerender, container } = render(<CollapsibleCard id="a" title="A" visible={false}><p>x</p></CollapsibleCard>);
    expect(container.textContent).toBe('');
    rerender(<CollapsibleCard id="a" title="A" visible><p>x</p></CollapsibleCard>);
    expect(screen.getByText('x')).toBeTruthy();
  });

  describe('auto-expand on new event', () => {
    it('expands a collapsed card once when the signal changes to a new truthy value', () => {
      const { rerender } = render(<CollapsibleCard id="a" title="A" defaultOpen={false} signal={null}><p>x</p></CollapsibleCard>);
      expect(screen.queryByText('x')).toBeNull();
      rerender(<CollapsibleCard id="a" title="A" defaultOpen={false} signal="shop1"><p>x</p></CollapsibleCard>);
      expect(toggle('A').getAttribute('aria-expanded')).toBe('true');
      // user collapses again; same signal must not re-open it
      fireEvent.click(toggle('A'));
      rerender(<CollapsibleCard id="a" title="A" defaultOpen={false} signal="shop1"><p>x</p></CollapsibleCard>);
      expect(toggle('A').getAttribute('aria-expanded')).toBe('false');
      // a different new event expands again
      rerender(<CollapsibleCard id="a" title="A" defaultOpen={false} signal="shop2"><p>x</p></CollapsibleCard>);
      expect(toggle('A').getAttribute('aria-expanded')).toBe('true');
    });

    it('does not expand on mount, nor when the signal clears', () => {
      const { rerender } = render(<CollapsibleCard id="a" title="A" defaultOpen={false} signal="s1"><p>x</p></CollapsibleCard>);
      expect(toggle('A').getAttribute('aria-expanded')).toBe('false');
      rerender(<CollapsibleCard id="a" title="A" defaultOpen={false} signal={null}><p>x</p></CollapsibleCard>);
      expect(toggle('A').getAttribute('aria-expanded')).toBe('false');
    });

    it('does not expand when the signal is the same or zero', () => {
      const { rerender } = render(<CollapsibleCard id="a" title="A" defaultOpen={false} signal={0}><p>x</p></CollapsibleCard>);
      rerender(<CollapsibleCard id="a" title="A" defaultOpen={false} signal={0}><p>x</p></CollapsibleCard>);
      expect(toggle('A').getAttribute('aria-expanded')).toBe('false');
    });
  });
});
