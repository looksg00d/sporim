import type { CSSProperties, ReactNode } from 'react';
import { color as palette, typeStyle, type TypeToken } from '../tokens';

export interface TextProps {
  readonly as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'label';
  readonly token: TypeToken;
  readonly color?: string | undefined;
  readonly uppercase?: boolean | undefined;
  readonly align?: CSSProperties['textAlign'] | undefined;
  readonly style?: CSSProperties | undefined;
  readonly children: ReactNode;
  readonly htmlFor?: string | undefined;
  readonly id?: string | undefined;
}

/**
 * Typography with the ramp enforced: every piece of text picks a token, so nobody
 * invents a font size. `text-wrap: pretty` is on by default — DESIGN.md leans on it.
 */
export function Text({
  as: Tag = 'p',
  token,
  color = palette.ink,
  uppercase = false,
  align,
  style,
  children,
  htmlFor,
  id,
}: TextProps) {
  const base = typeStyle(token);
  return (
    <Tag
      id={id}
      {...(Tag === 'label' && htmlFor ? { htmlFor } : {})}
      style={{
        margin: 0,
        color,
        textTransform: uppercase ? 'uppercase' : undefined,
        textAlign: align,
        textWrap: 'pretty',
        ...base,
        lineHeight: base.lineHeight,
        letterSpacing: `${base.letterSpacing}px`,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/** The tracked uppercase kicker that sits above almost everything in this system. */
export function LabelCaps({
  children,
  color = palette.inkSecondary,
  small = false,
  style,
}: {
  readonly children: ReactNode;
  readonly color?: string;
  readonly small?: boolean;
  readonly style?: CSSProperties;
}) {
  return (
    <Text
      as="span"
      token={small ? 'labelCapsSm' : 'labelCaps'}
      color={color}
      uppercase
      style={style}
    >
      {children}
    </Text>
  );
}
