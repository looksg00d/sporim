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
    });
  });

  it('falls back to local defaults when nothing is set', () => {
    const env = parsePublicEnv({});
    expect(env).toMatchObject({ appEnv: 'local', chainMode: 'mock', feeBps: 300 });
    expect(env.appUrl).toBe('http://localhost:3000');
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
