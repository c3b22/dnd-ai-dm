'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from '@/lib/prefersReducedMotion';

export interface DiceRollOverlayProps {
  values: number[];
  onComplete: () => void;
}

// Let the result sit on screen for a beat before the overlay clears.
const SETTLE_PAUSE_MS = 900;
// A normal roll takes a few seconds. If the render loop stalls (background tab, GPU stall,
// lost WebGL context) the dice never report they settled, and the DM's reply is held back
// until this overlay completes, so give up and reveal everything instead of hanging the table.
const MAX_ROLL_MS = 10_000;

export function DiceRollOverlay({ values, onComplete }: DiceRollOverlayProps) {
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let diceBox: { clear?: () => void } | null = null;

    function finish() {
      if (doneRef.current || cancelled) return;
      doneRef.current = true;
      onCompleteRef.current();
    }

    if (prefersReducedMotion() || values.length === 0) {
      finish();
      return () => {
        cancelled = true;
      };
    }

    const failsafeId = setTimeout(finish, MAX_ROLL_MS);

    (async () => {
      try {
        const { default: DiceBox } = await import('@3d-dice/dice-box');
        if (cancelled) return;
        const box = new DiceBox({
          container: '#dice-roll-overlay-box',
          assetPath: '/assets/',
          themeColor: '#d7263d',
          scale: 10,
        });
        diceBox = box;
        await box.init();
        if (cancelled) return;
        box.onRollComplete = () => {
          if (cancelled) return;
          setLanded(true);
          setTimeout(finish, SETTLE_PAUSE_MS);
        };
        box.roll(`${values.length}d20@${values.join(',')}`);
      } catch {
        // No WebGL, a blocked asset load, or any other 3D failure: skip straight
        // to the plain pill in the log instead of leaving the table stuck.
        finish();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(failsafeId);
      try {
        diceBox?.clear?.();
      } catch {
        /* best-effort cleanup */
      }
    };
    // This batch of values rolls exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === 'undefined') return null;

  // Mounted straight onto <body>: the game screen has ancestors with overflow
  // and transform rules that would otherwise clip or reposition a fixed overlay.
  return createPortal(
    <div className="dice-overlay" role="presentation">
      <div
        id="dice-roll-overlay-box"
        className={`dice-overlay-box${landed ? ' landed' : ''}`}
      />
      {landed && (
        <div className="dice-result" aria-live="polite">
          {values.join(', ')}
        </div>
      )}
    </div>,
    document.body
  );
}
