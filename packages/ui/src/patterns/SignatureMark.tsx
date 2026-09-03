import { signatureToPath, SIGNATURE_WIDTH, type Signature } from '@sporim/domain';
import type { CSSProperties } from 'react';
import { color, font } from '../tokens';

/**
 * Draws a signature, read-only. Used on the review screen, on the bet card and — the reason
 * it is an `<svg><path>` rather than an image — inside `next/og`, where satori draws paths
 * but cannot embed a canvas blob.
 */

export interface SignatureMarkProps {
  readonly signature: Signature;
  readonly height?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly style?: CSSProperties;
  readonly title?: string;
}

export function SignatureMark({
  signature,
  height = 64,
  stroke = color.ink,
  strokeWidth = 9,
  style,
  title = 'Signature',
}: SignatureMarkProps) {
  if (signature.kind === 'typed') {
    return (
      <span
        aria-label={`${title}: ${signature.name}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          fontFamily: font.display,
          fontSize: Math.round(height * 0.46),
          fontWeight: 700,
          letterSpacing: '-0.5px',
          color: stroke,
          ...style,
        }}
      >
        {signature.name}
      </span>
    );
  }

  const path = signatureToPath(signature.strokes);
  if (path === '') return null;

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${SIGNATURE_WIDTH} ${signature.height}`}
      height={height}
      // The stroke space is normalised to a fixed width, so the drawn aspect ratio is
      // whatever the pad had; letting the viewBox drive the width keeps it undistorted.
      width={Math.round((height * SIGNATURE_WIDTH) / Math.max(signature.height, 1))}
      fill="none"
      style={{ display: 'block', overflow: 'visible', ...style }}
    >
      <path
        d={path}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
