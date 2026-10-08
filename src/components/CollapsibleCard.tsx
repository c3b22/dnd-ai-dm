'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface CollapsibleCardProps {
  /** Stable id; the open/closed state is remembered per id in this browser. */
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** When false nothing is rendered, but the remembered state is kept. */
  visible?: boolean;
  /**
   * "New event" token. A collapsed card expands once when this changes to a new truthy
   * value after mount (shop opened, enemy appeared, new trade offer). Clearing it does nothing.
   */
  signal?: string | number | null;
  children: ReactNode;
}

const KEY = (id: string) => `rail-card:${id}`;

function readStored(id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY(id));
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

function writeStored(id: string, open: boolean): void {
  try {
    window.localStorage.setItem(KEY(id), open ? '1' : '0');
  } catch {
    // storage unavailable: state just isn't remembered
  }
}

// The wrapped child keeps its own card markup and behaviour; this only adds a header button that hides it.
export function CollapsibleCard({ id, title, defaultOpen = true, visible = true, signal = null, children }: CollapsibleCardProps) {
  // Read storage after mount so server and first client render agree.
  const [open, setOpen] = useState(defaultOpen);
  const prevSignal = useRef(signal);

  useEffect(() => {
    const stored = readStored(id);
    if (stored !== null) setOpen(stored);
  }, [id]);

  useEffect(() => {
    if (signal !== prevSignal.current && signal) {
      setOpen(true);
      writeStored(id, true);
    }
    prevSignal.current = signal;
  }, [signal, id]);

  if (!visible) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    writeStored(id, next);
  }

  return (
    <div className={`collapsible${open ? ' is-open' : ''}`}>
      <button type="button" className="collapsible-toggle" aria-expanded={open} onClick={toggle}>
        <span>{title}</span>
        <span aria-hidden="true" className="collapsible-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && children}
    </div>
  );
}
