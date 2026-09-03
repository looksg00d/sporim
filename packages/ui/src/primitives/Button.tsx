import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { color, control, motion, radius, space, typeStyle } from '../tokens';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'nav';

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: color.accent,
    color: color.onAccent,
    border: 'none',
    minHeight: control.primaryHeight,
  },
  secondary: {
    background: 'transparent',
    color: color.ink,
    border: `1px solid ${color.hairlineStrong}`,
    minHeight: control.secondaryHeight,
  },
  ghost: {
    background: 'transparent',
    color: color.inkSecondary,
    border: 'none',
    minHeight: control.ghostHeight,
  },
  nav: {
    background: color.accent,
    color: color.onAccent,
    border: 'none',
    minHeight: control.navHeight,
  },
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'sporim-primary',
  secondary: 'sporim-secondary',
  ghost: 'sporim-ghost',
  nav: 'sporim-primary',
};

export interface PillButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'style' | 'className'
> {
  readonly variant?: ButtonVariant;
  readonly icon?: IconName;
  readonly iconPosition?: 'leading' | 'trailing';
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}

/**
 * The only button shape in the system. Pill, always; hover and focus live in styles.css
 * because inline styles cannot express them.
 */
export function PillButton({
  variant = 'primary',
  icon,
  iconPosition = 'leading',
  fullWidth = false,
  children,
  style,
  type = 'button',
  ...rest
}: PillButtonProps) {
  const isNav = variant === 'nav';
  const label = <span>{children}</span>;
  const glyph = icon ? <Icon name={icon} size={isNav ? 16 : 18} /> : null;

  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]} sporim-focusable`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs + 2,
        width: fullWidth ? '100%' : undefined,
        padding: `0 ${isNav ? space.lg : space.xl}px`,
        borderRadius: radius.pill,
        cursor: 'pointer',
        transition: `background ${motion.colorMs}ms ease, border-color ${motion.colorMs}ms ease, color ${motion.colorMs}ms ease`,
        ...typeStyle(isNav ? 'bodySm' : 'button'),
        letterSpacing: 0,
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {iconPosition === 'leading' ? glyph : null}
      {label}
      {iconPosition === 'trailing' ? glyph : null}
    </button>
  );
}

export interface PillLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'style' | 'className'
> {
  readonly variant?: ButtonVariant;
  readonly icon?: IconName;
  readonly iconPosition?: 'leading' | 'trailing';
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}

/**
 * The same pill for navigation. A CTA that moves you to another page is a link — it must
 * survive middle-click and "copy link address" — so it renders an anchor, not a button.
 */
export function PillLink({
  variant = 'primary',
  icon,
  iconPosition = 'leading',
  fullWidth = false,
  children,
  style,
  ...rest
}: PillLinkProps) {
  const isNav = variant === 'nav';
  const glyph = icon ? <Icon name={icon} size={isNav ? 16 : 18} /> : null;

  return (
    <a
      className={`${VARIANT_CLASS[variant]} sporim-focusable`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs + 2,
        width: fullWidth ? '100%' : undefined,
        padding: `0 ${isNav ? space.lg : space.xl}px`,
        borderRadius: radius.pill,
        textDecoration: 'none',
        cursor: 'pointer',
        transition: `background ${motion.colorMs}ms ease, border-color ${motion.colorMs}ms ease, color ${motion.colorMs}ms ease`,
        ...typeStyle(isNav ? 'bodySm' : 'button'),
        letterSpacing: 0,
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {iconPosition === 'leading' ? glyph : null}
      <span>{children}</span>
      {iconPosition === 'trailing' ? glyph : null}
    </a>
  );
}
