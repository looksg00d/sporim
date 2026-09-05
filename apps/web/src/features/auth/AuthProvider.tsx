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
 * Phantom first, email behind it — the decision from 2026-09-05, reversing the ordering from
 * two days earlier.
 *
 * The reasoning is the $25. Somebody arriving with Phantom already has USDC in it: connect,
 * sign, done, in seconds. Somebody arriving with nothing has to buy USDC on Solana at an
 * amount where the on-ramp fee can be a large share of the stake — a path we have not built
 * and might never. Putting the fast path first is not a preference between equals.
 *
 * `showWalletLoginFirst` alone would only hoist the *wallet section*; `walletList` is what
 * names the buttons inside it and their order, and Privy's default is Ethereum-shaped
 * (metamask, coinbase, rainbow, wallet_connect). Both are set, so Phantom is the first thing
 * on the first screen rather than something found one tap in.
 *
 * `detected_solana_wallets` sits second deliberately — it is the catch-all for whatever
 * extension the browser actually has, so somebody on Solflare or Backpack is not made to feel
 * the product was built for a wallet they do not use.
 *
 * `loginMethodsAndOrder` would place 'phantom' even more literally, above every social
 * option, and is not used: Privy marks it deprecated and warns that it overrides their
 * designed defaults. Two supported fields beat one deprecated one.
 *
 * **What this does not fix.** Instagram's in-app browser injects no wallet, because it has no
 * extensions — so on the screen most reel traffic lands on, the Phantom button has nothing to
 * connect to. The way out is Phantom's Browse deeplink, which opens this site inside
 * Phantom's own browser. That is a separate piece of work and it is not written yet; see
 * `docs/NEXT-SESSION.md`. Email staying in the modal is what keeps that case from being a
 * dead end in the meantime.
 *
 * `createOnLogin: 'users-without-wallets'`: whoever arrives with a wallet keeps theirs — and
 * unlike a fresh embedded one, theirs already holds money.
 *
 * Themed from the design tokens rather than from a copy of the hex values, so the modal and
 * the page cannot drift apart.
 */
const privyConfig: PrivyClientConfig = {
  loginMethods: ['wallet', 'email'],
  appearance: {
    theme: color.canvas,
    accentColor: color.accent,
    // Solana only. Offering an Ethereum wallet here would be offering a wallet that cannot
    // hold the stake.
    walletChainType: 'solana-only',
    showWalletLoginFirst: true,
    walletList: ['phantom', 'detected_solana_wallets', 'solflare', 'backpack'],
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
