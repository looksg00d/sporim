import type { CSSProperties } from 'react';

/**
 * The whole icon set. Stroke-only, 24-box, round caps — per DESIGN.md there are no
 * emoji or dingbats in UI chrome, and every icon must recolour with `currentColor`.
 *
 * Multi-part icons group with `<g>`, never a fragment: satori serialises an `<svg>`'s
 * children to a string and cannot print a fragment, so one `<>` here breaks every OG image
 * that draws a `BetCard`.
 */
export const ICON_PATHS = {
  check: <path d="M20 6 9 17l-5-5" />,
  lock: (
    <g>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </g>
  ),
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  link: (
    <g>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </g>
  ),
  clock: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </g>
  ),
  scale: (
    <g>
      <path d="M12 4v16M7 8h10" />
      <path d="M5 8 2 15h6zM19 8l-3 7h6z" />
    </g>
  ),
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly color?: string;
  readonly style?: CSSProperties;
  readonly title?: string;
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 2.4,
  color = 'currentColor',
  style,
  title,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {ICON_PATHS[name]}
    </svg>
  );
}
