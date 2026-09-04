'use client';

import { PrivyProvider, usePrivy, type PrivyClientConfig } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { color } from '@sporim/ui';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { env } from '@/lib/env';

/**
 * Signing in.
 *
 * Wrapped in a context of our own rather than calling `usePrivy` from screens, for two
 * reasons that both come down to the same thing — the product should not be shaped by the
 * vendor:
 *
 *   * A deployment without a Privy app id is a real state (`env.privyAppId` is nullable), and
 *     `usePrivy` throws outside a provider. `configured` makes that a fact a screen can read
 *     and say out loud, instead of a crash. It fails closed: nothing anywhere treats "not
 *     configured" as "signed in".
 *   * The surface a screen gets is four values. Swapping the provider later is this file.
 *
 * Mounted per-route rather than in the root layout. The landing page is where traffic from a
 * reel arrives, on a phone, on mobile data — it has nothing to authenticate and should not
 * pay for a wallet SDK to find that out. Today that is `/new/*`; `/r/*` joins it when taking
 * a role stops being read-only.
 */

export interface AuthState {
  /** Whether this deployment can sign anybody in at all. */
  readonly configured: boolean;
  /** Privy has finished restoring any existing session. Until then, nothing is known. */
  readonly ready: boolean;
  readonly authenticated: boolean;
  readonly login: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Ready, and definitively nobody. Not a degraded session: there is no code path from here to
 * an authenticated request, because the server only ever believes a verified token.
 */
const UNCONFIGURED: AuthState = {
  configured: false,
  ready: true,
  authenticated: false,
  login: () => {},
};

/**
 * The e2e suite's session. Selected only by `env.authStub`, which a non-local build cannot
 * turn on — see the field in `lib/env.ts` for why that is the whole safety argument. It
 * grants nothing: the server verifies a Privy JWT and there is none here, so a request made
 * under this state is refused exactly like an anonymous one.
 */
const STUBBED: AuthState = {
  configured: true,
  ready: true,
  authenticated: true,
  login: () => {},
};

/**
 * Email first, wallet alongside it — the decision from 2026-09-03, and the reason is the
 * traffic: a reel opens in Instagram's in-app browser, where there are no extensions and a
 * deep link into Phantom loses the tab. Somebody who already has Phantom is one click away
 * from it in the same modal; `showWalletLoginFirst` stays false so the person who does not is
 * never shown a dead end first.
 *
 * `createOnLogin: 'users-without-wallets'` for the same reason: the person who arrived with a
 * wallet keeps theirs — and, unlike a fresh embedded one, theirs already holds USDC.
 *
 * Themed from the design tokens rather than from a copy of the hex values, so the modal and
 * the page cannot drift apart.
 */
const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'wallet'],
  appearance: {
    theme: color.canvas,
    accentColor: color.accent,
    // Solana only. Offering an Ethereum wallet here would be offering a wallet that cannot
    // hold the stake.
    walletChainType: 'solana-only',
    showWalletLoginFirst: false,
  },
  embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } },
  externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
};

function PrivyBridge({ children }: { readonly children: ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const value = useMemo<AuthState>(
    () => ({ configured: true, ready, authenticated, login: () => login() }),
    [ready, authenticated, login],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  if (env.authStub) return <AuthContext.Provider value={STUBBED}>{children}</AuthContext.Provider>;

  const appId = env.privyAppId;
  if (!appId) return <AuthContext.Provider value={UNCONFIGURED}>{children}</AuthContext.Provider>;

  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
