import { describe, expect, it } from 'vitest';
import { EnvError, parsePublicEnv, parseServerEnv } from './env';

const valid = {
  NEXT_PUBLIC_APP_URL: 'https://sporim.app',
  NEXT_PUBLIC_APP_ENV: 'production',
  NEXT_PUBLIC_CHAIN_MODE: 'devnet',
  NEXT_PUBLIC_SOLANA_CLUSTER: 'devnet',
  NEXT_PUBLIC_FEE_BPS: '300',
  NEXT_PUBLIC_MAX_STAKE_USDC: '100',
};

describe('parsePublicEnv', () => {
  it('parses a complete environment', () => {
    expect(parsePublicEnv(valid)).toEqual({
      appUrl: 'https://sporim.app',
      appEnv: 'production',
      chainMode: 'devnet',
      solanaCluster: 'devnet',
      feeBps: 300,
      maxStakeUsdc: 100,
      // `null` rather than absent: a deployment without sign-in configured is a real state
      // the review screen renders differently, not a missing variable to shrug at.
      privyAppId: null,
      authStub: false,
    });
  });

  it('falls back to local defaults when nothing is set', () => {
    const env = parsePublicEnv({});
    expect(env).toMatchObject({ appEnv: 'local', chainMode: 'mock', feeBps: 300 });
    expect(env.appUrl).toBe('http://localhost:3000');
  });

  describe('the stubbed session', () => {
    it('is off unless it is asked for', () => {
      expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_APP_ENV: 'local' }).authStub).toBe(false);
    });

    it('turns on for a local build that asks for it', () => {
      expect(
        parsePublicEnv({
          ...valid,
          NEXT_PUBLIC_APP_ENV: 'local',
          NEXT_PUBLIC_AUTH_MODE: 'stub',
        }).authStub,
      ).toBe(true);
    });

    /*
     * The guard, and the reason the flag is safe to ship in the bundle at all: setting it on
     * a deployment does nothing. Were this to regress, a preview or production build would
     * tell every visitor they were signed in.
     */
    it.each(['preview', 'production'])('stays off on a %s deployment that asks for it', (env) => {
      expect(
        parsePublicEnv({ ...valid, NEXT_PUBLIC_APP_ENV: env, NEXT_PUBLIC_AUTH_MODE: 'stub' })
          .authStub,
      ).toBe(false);
    });

    it('ignores any other value', () => {
      expect(
        parsePublicEnv({
          ...valid,
          NEXT_PUBLIC_APP_ENV: 'local',
          NEXT_PUBLIC_AUTH_MODE: 'true',
        }).authStub,
      ).toBe(false);
    });
  });

  it('throws on a malformed URL rather than rendering against it', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_APP_URL: 'sporim.app' })).toThrow(EnvError);
  });

  it('rejects an unknown chain mode', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_CHAIN_MODE: 'mainnet' })).toThrow(EnvError);
  });

  it('rejects a fee above the 10% ceiling', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_FEE_BPS: '1500' })).toThrow(EnvError);
  });

  it('rejects a stake cap above the phase-0 limit', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_MAX_STAKE_USDC: '5000' })).toThrow(
      EnvError,
    );
  });

  it('names the offending key in the message', () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_APP_ENV: 'staging' })).toThrow(/appEnv/);
  });
});

describe('parseServerEnv', () => {
  const server = {
    DATABASE_URL: 'postgresql://user:pw@host.example/db?sslmode=require',
    SOLANA_RPC_URL: 'https://api.devnet.solana.com',
  };

  it('parses a complete server environment', () => {
    expect(parseServerEnv(server)).toEqual({
      databaseUrl: 'postgresql://user:pw@host.example/db?sslmode=require',
      solanaRpcUrl: 'https://api.devnet.solana.com',
    });
  });

  it('throws when the database URL is missing instead of running without one', () => {
    const { DATABASE_URL: _omitted, ...rest } = server;
    expect(() => parseServerEnv(rest)).toThrow(EnvError);
  });

  it('throws when the database URL is present but empty', () => {
    expect(() => parseServerEnv({ ...server, DATABASE_URL: '' })).toThrow(EnvError);
  });

  it('rejects something that is not a postgres URL', () => {
    expect(() => parseServerEnv({ ...server, DATABASE_URL: 'https://xata.tech' })).toThrow(
      EnvError,
    );
  });
});

describe('resolving the app URL', () => {
  it('prefers an explicit value — production runs on a domain Vercel does not know', () => {
    expect(
      parsePublicEnv({
        ...valid,
        NEXT_PUBLIC_APP_URL: 'https://sporim.app',
        VERCEL_URL: 'x.vercel.app',
      }).appUrl,
    ).toBe('https://sporim.app');
  });

  it('falls back to the deployment host so every preview advertises itself', () => {
    const { NEXT_PUBLIC_APP_URL: _omitted, ...rest } = valid;
    expect(
      parsePublicEnv({ ...rest, NEXT_PUBLIC_VERCEL_URL: 'sporim-abc123.vercel.app' }).appUrl,
    ).toBe('https://sporim-abc123.vercel.app');
  });

  it('adds the scheme Vercel leaves off, and keeps one that is already there', () => {
    const { NEXT_PUBLIC_APP_URL: _a, ...rest } = valid;
    expect(parsePublicEnv({ ...rest, VERCEL_URL: 'https://already.example' }).appUrl).toBe(
      'https://already.example',
    );
  });

  it('treats an empty string as absent rather than parsing it as a URL', () => {
    expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_APP_URL: '   ' }).appUrl).toBe(
      'http://localhost:3000',
    );
  });
});
