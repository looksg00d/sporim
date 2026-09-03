'use client';

import {
  MAX_SIGNATURE_STROKES,
  MAX_TYPED_SIGNATURE_LENGTH,
  SIGNATURE_WIDTH,
  clampSignature,
  drawnSignature,
  isSignatureMeaningful,
  signatureToPath,
  typedSignature,
  type Signature,
  type SignatureStroke,
} from '@sporim/domain';
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { color, radius, space, typeStyle } from '../tokens';

/**
 * Sign the commitment with a finger.
 *
 * The ritual is the product: a bet you scrawled your name on is harder to walk away from
 * than one you tapped through, and the scrawl is the thing people screenshot. It replaces
 * the press-and-hold on the create flow — two rituals for one action is one too many.
 *
 * Three things this deliberately does:
 *
 * - **Points, not pixels.** Strokes are captured in a normalised space and handed up as
 *   numbers, so the same signature renders on the screen, on the card and inside satori.
 * - **A typed alternative, always.** A drawn-only gate locks out anyone who cannot use a
 *   pointer. Typing your name is a first-class path, not a consolation prize.
 * - **Nothing legal is claimed.** This is a keepsake and a commitment device. The copy here
 *   and everywhere else must never call it binding.
 */

export interface SignaturePadProps {
  readonly value: Signature | null;
  readonly onChange: (signature: Signature | null) => void;
  readonly label?: string;
  readonly height?: number;
  readonly disabled?: boolean;
  readonly style?: CSSProperties;
}

/** Points closer than this add nothing but weight. */
const MIN_POINT_DISTANCE = 6;

export function SignaturePad({
  value,
  onChange,
  label = 'Sign here',
  height = 150,
  disabled = false,
  style,
}: SignaturePadProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<number[][]>([]);
  const drawingRef = useRef(false);
  const [, forceRender] = useState(0);
  const [typing, setTyping] = useState(value?.kind === 'typed');
  const [typed, setTyped] = useState(value?.kind === 'typed' ? value.name : '');

  const drawnHeight = Math.round(
    (height * SIGNATURE_WIDTH) / Math.max(surfaceWidth(surfaceRef), 1),
  );

  const emit = useCallback(() => {
    const strokes = strokesRef.current.filter((stroke) => stroke.length >= 2);
    if (strokes.length === 0) {
      onChange(null);
      return;
    }
    onChange(clampSignature(drawnSignature(strokes as SignatureStroke[], drawnHeight)));
  }, [onChange, drawnHeight]);

  const pointFrom = useCallback((event: PointerEvent<HTMLDivElement>): [number, number] | null => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    if (rect.width === 0) return null;
    // Normalised so the stroke is independent of the pad's pixel size.
    const scale = SIGNATURE_WIDTH / rect.width;
    return [
      Math.round((event.clientX - rect.left) * scale),
      Math.round((event.clientY - rect.top) * scale),
    ];
  }, []);

  const start = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled || typing) return;
      const point = pointFrom(event);
      if (!point) return;
      if (strokesRef.current.length >= MAX_SIGNATURE_STROKES) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drawingRef.current = true;
      strokesRef.current = [...strokesRef.current, [point[0], point[1]]];
      forceRender((n) => n + 1);
    },
    [disabled, typing, pointFrom],
  );

  const move = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!drawingRef.current) return;
      const point = pointFrom(event);
      if (!point) return;

      const current = strokesRef.current[strokesRef.current.length - 1];
      if (!current) return;
      const lastX = current[current.length - 2] ?? 0;
      const lastY = current[current.length - 1] ?? 0;
      if (Math.hypot(point[0] - lastX, point[1] - lastY) < MIN_POINT_DISTANCE) return;

      current.push(point[0], point[1]);
      forceRender((n) => n + 1);
    },
    [pointFrom],
  );

  const end = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    emit();
  }, [emit]);

  const clear = useCallback(() => {
    strokesRef.current = [];
    setTyped('');
    onChange(null);
    forceRender((n) => n + 1);
  }, [onChange]);

  const path = signatureToPath(strokesRef.current);
  const hasInk = path !== '';
  const signed = isSignatureMeaningful(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...typeStyle('labelCaps'), color: color.inkSecondary }}>
          {label.toUpperCase()}
        </span>
        <button
          type="button"
          className="sporim-link sporim-focusable"
          onClick={clear}
          disabled={disabled || (!hasInk && typed === '')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: hasInk || typed !== '' ? color.accent : color.inkFaint,
            ...typeStyle('bodySm'),
          }}
        >
          Clear
        </button>
      </div>

      {typing ? (
        <input
          className="sporim-input sporim-focusable"
          value={typed}
          disabled={disabled}
          autoFocus
          maxLength={MAX_TYPED_SIGNATURE_LENGTH}
          aria-label="Type your name to sign"
          placeholder="Your name"
          onChange={(event) => {
            setTyped(event.target.value);
            const next = typedSignature(event.target.value);
            onChange(isSignatureMeaningful(next) ? next : null);
          }}
          style={{
            width: '100%',
            height,
            padding: space.md,
            borderRadius: radius.md,
            border: `1px dashed ${signed ? color.accent : color.hairlineStrong}`,
            background: color.surface,
            color: color.ink,
            textAlign: 'center',
            ...typeStyle('displaySm'),
          }}
        />
      ) : (
        <div
          ref={surfaceRef}
          role="application"
          aria-label="Signature area — draw your signature"
          data-testid="signature-pad"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            position: 'relative',
            height,
            borderRadius: radius.md,
            border: `1px dashed ${signed ? color.accent : color.hairlineStrong}`,
            background: color.surface,
            cursor: disabled ? 'not-allowed' : 'crosshair',
            touchAction: 'none',
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          <svg
            viewBox={`0 0 ${SIGNATURE_WIDTH} ${drawnHeight}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            fill="none"
            aria-hidden
          >
            <path
              d={path}
              stroke={color.ink}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {!hasInk ? (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                ...typeStyle('bodySm'),
                color: color.inkFaint,
              }}
            >
              Draw your signature
            </span>
          ) : null}
        </div>
      )}

      <button
        type="button"
        className="sporim-link sporim-focusable"
        onClick={() => {
          setTyping((was) => !was);
          clear();
        }}
        disabled={disabled}
        style={{
          alignSelf: 'flex-start',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: color.inkSecondary,
          textDecoration: 'underline',
          ...typeStyle('micro'),
        }}
      >
        {typing ? 'Draw it instead' : 'Type your name instead'}
      </button>
    </div>
  );
}

/** Reads the live pad width so strokes normalise against the real element, not a guess. */
function surfaceWidth(ref: { current: HTMLDivElement | null }): number {
  return ref.current?.getBoundingClientRect().width ?? SIGNATURE_WIDTH;
}
