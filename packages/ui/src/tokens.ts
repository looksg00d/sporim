/**
 * Design tokens — the machine-readable half of DESIGN.md ("Acid Arena").
 *
 * These are plain values, not CSS variables, because the same components must render
 * inside `next/og` (satori), which resolves neither CSS custom properties nor Tailwind.
 * `styles.css` mirrors them as custom properties for the things inline styles cannot do:
 * hover, focus, animation, media queries.
 */

export const color = {
  canvas: '#0f1014',
  surface: '#16181e',
  surfaceRaised: '#1d2027',
  hairline: '#2a2d36',
  hairlineStrong: '#3a3e49',
  ink: '#f2f1ec',
  inkMuted: '#c6c6cc',
  inkSecondary: '#9a9aa3',
  inkFaint: '#6f6f78',
  accent: '#c9ff3f',
  accentHover: '#e4ff8a',
  accentDim: '#8fb82a',
  onAccent: '#0f1014',
  loss: '#ff5c4d',
  focus: '#7ee0ff',
} as const;

export const font = {
  display: "Unbounded, 'Arial Black', Impact, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, 'Courier New', monospace",
} as const;

/** Type ramp straight from DESIGN.md. Sizes in px, spacing in px, lineHeight unitless. */
export const type = {
  displayXl: {
    fontFamily: font.display,
    fontSize: 92,
    fontWeight: 900,
    lineHeight: 0.94,
    letterSpacing: -4,
  },
  displayLg: {
    fontFamily: font.display,
    fontSize: 56,
    fontWeight: 900,
    lineHeight: 0.96,
    letterSpacing: -2.5,
  },
  displayMd: {
    fontFamily: font.display,
    fontSize: 38,
    fontWeight: 900,
    lineHeight: 1.0,
    letterSpacing: -1.5,
  },
  displaySm: {
    fontFamily: font.display,
    fontSize: 30,
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: -1,
  },
  headingLg: {
    fontFamily: font.display,
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.5,
  },
  headingMd: {
    fontFamily: font.display,
    fontSize: 19,
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: -0.4,
  },
  wordmark: {
    fontFamily: font.display,
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1.0,
    letterSpacing: -0.4,
  },
  bodyLg: {
    fontFamily: font.mono,
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1.6,
    letterSpacing: 0,
  },
  body: {
    fontFamily: font.mono,
    fontSize: 15,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: 0,
  },
  bodySm: {
    fontFamily: font.mono,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  value: {
    fontFamily: font.mono,
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  button: {
    fontFamily: font.mono,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.0,
    letterSpacing: 0,
  },
  labelCaps: {
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 2.2,
  },
  labelCapsSm: {
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: 1.8,
  },
  micro: {
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
} as const;

export type TypeToken = keyof typeof type;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  section: 48,
  huge: 56,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 20,
  pill: 9999,
  full: 9999,
} as const;

/** Touch targets — DESIGN.md floors. Primary is deliberately larger than the 44px minimum. */
export const control = {
  primaryHeight: 56,
  secondaryHeight: 52,
  ghostHeight: 48,
  navHeight: 44,
  inputHeight: 52,
} as const;

export const motion = {
  colorMs: 180,
  riseMs: 700,
  popMs: 600,
  ease: 'cubic-bezier(.2,.8,.2,1)',
  holdMs: 800,
} as const;

/** The one real shadow in the system (hero card, Level 7). */
export const shadow = {
  heroCard: '0 40px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(201, 255, 63, 0.08)',
} as const;

/**
 * One radial accent glow per screen, behind the moment that matters.
 * `x`/`y` are CSS percentages.
 */
export function accentGlow(x = 50, y = 40, alpha = 0.16): string {
  return `radial-gradient(820px 520px at ${x}% ${y}%, rgba(201, 255, 63, ${alpha}), transparent 62%)`;
}

/** Turns a type token into a React style object. */
export function typeStyle(token: TypeToken): {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
} {
  return { ...type[token] };
}
