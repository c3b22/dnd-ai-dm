import { useEffect, useState, type FocusEvent, type KeyboardEvent } from 'react';

/** O2: one-tooltip-at-a-time state shared by the shop and trade lists (same behaviour as the inventory: hover/focus shows, tap on the name pins, Esc closes). */
export function useItemTip() {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const openKey = pinned ?? hover;
  useEffect(() => {
    if (pinned === null) return;
    const close = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('[data-tip-host]')) setPinned(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pinned]);
  return {
    isOpen: (key: string) => openKey === key,
    tipId: (key: string) => `item-tip-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`,
    /** Spread on the element that contains both the item name and its tooltip. */
    hostProps: (key: string) => ({
      'data-tip-host': '',
      onMouseEnter: () => setHover(key),
      onMouseLeave: () => setHover((h) => (h === key ? null : h)),
      onFocus: () => setHover(key),
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover((h) => (h === key ? null : h));
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Escape') {
          setHover(null);
          setPinned(null);
        }
      },
    }),
    togglePin: (key: string) => setPinned((p) => (p === key ? null : key)),
  };
}
