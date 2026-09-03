'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { color, control, motion, radius, space, typeStyle } from '../tokens';
import { Icon, type IconName } from './Icon';

const TICK_MS = 40;

export interface HoldButtonProps {
  readonly onComplete: () => void;
  /** Fired once when the press begins. */
  readonly onHoldStart?: (() => void) | undefined;
  /** Fired when a press ends before completing, with how long it lasted. */
  readonly onHoldCancel?: ((heldMs: number) => void) | undefined;
  readonly holdMs?: number;
  readonly disabled?: boolean;
  readonly icon?: IconName;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
  readonly 'data-testid'?: string;
}

/**
 * Press-and-hold to commit. The deliberate friction is the point: signing a bet should
 * feel like signing, not like tapping. Releasing early cancels with no side effect.
 *
 * Keyboard: hold Space or Enter. Screen readers get the instruction and live progress.
 */
export function HoldButton({
  onComplete,
  onHoldStart,
  onHoldCancel,
  holdMs = motion.holdMs,
  disabled = false,
  icon = 'lock',
  children,
  style,
  'data-testid': testId,
}: HoldButtonProps) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onHoldCancelRef = useRef(onHoldCancel);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onHoldCancelRef.current = onHoldCancel;
  }, [onComplete, onHoldCancel]);

  const stop = useCallback(() => {
    const wasRunning = timerRef.current !== null;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // A release *after* completion is not a cancellation — only an early one is.
    if (wasRunning && !firedRef.current && startedAtRef.current !== null) {
      onHoldCancelRef.current?.(Date.now() - startedAtRef.current);
    }
    startedAtRef.current = null;
    setElapsed(0);
  }, []);

  // Never leave a timer running if the button unmounts mid-hold.
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    if (disabled || timerRef.current !== null) return;
    firedRef.current = false;
    startedAtRef.current = Date.now();
    setElapsed(0);
    onHoldStart?.();
    timerRef.current = setInterval(() => {
      setElapsed((previous) => {
        const next = previous + TICK_MS;
        if (next >= holdMs && !firedRef.current) {
          firedRef.current = true;
          // Stop before firing so a re-render from onComplete cannot double-fire.
          if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          onCompleteRef.current();
          return 0;
        }
        return next;
      });
    }, TICK_MS);
  }, [disabled, holdMs, onHoldStart]);

  const progress = Math.min(elapsed / holdMs, 1);

  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      className="sporim-focusable"
      aria-describedby="sporim-hold-hint"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') stop();
      }}
      onBlur={stop}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs + 2,
        width: '100%',
        minHeight: control.primaryHeight,
        padding: `0 ${space.xl}px`,
        borderRadius: radius.pill,
        border: `1px solid ${color.accent}`,
        background: 'transparent',
        color: disabled ? color.inkFaint : color.accent,
        cursor: disabled ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        opacity: disabled ? 0.55 : 1,
        ...typeStyle('button'),
        letterSpacing: 0,
        ...style,
      }}
    >
      {/* The fill sweeps left-to-right; the label sits above it and inverts as it passes. */}
      <span
        aria-hidden
        className="sporim-hold-fill"
        style={{
          position: 'absolute',
          inset: 0,
          width: `${progress * 100}%`,
          background: color.accent,
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: space.xs + 2,
          color: progress > 0.5 ? color.onAccent : undefined,
        }}
      >
        <Icon name={icon} size={18} />
        {children}
      </span>
      <span id="sporim-hold-hint" style={{ display: 'none' }}>
        Press and hold to confirm.
      </span>
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        style={{ display: 'none' }}
      />
    </button>
  );
}
