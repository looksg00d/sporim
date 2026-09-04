import { describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type JWTHeaderParameters } from 'jose';
import { createLocalJWKSet } from 'jose';
import {
  PRIVY_ISSUER,
  isPrivyDid,
  verifyPrivyAccessToken,
  type PrivyVerifier,
} from './privy-token';

/**
 * Authentication, driven by the only thing that decides it: a signature.
 *
 * Every case below mints a *real* token with a real key — nothing is stubbed, and the
 * verifier under test is the same function the app calls. Which means these tests fail if
 * somebody relaxes the issuer check, drops the audience check, or lets `alg` float; each of
 * those is a way to be signed in as somebody you are not, and none of them looks like a bug
 * from the outside.
 */

const APP_ID = 'cltestappid00000000000001';
const OTHER_APP_ID = 'cltestappid00000000000002';
const DID = 'did:privy:cltestuser000000000001';

interface Keys {
  readonly privateKey: CryptoKey;
  readonly jwk: JWK;
  /** Carried separately: `JWK.kid` is optional, and a header will not take an explicit undefined. */
  readonly kid: string;
}

async function makeKeys(kid: string): Promise<Keys> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' };
  return { privateKey, jwk, kid };
}

const signer = await makeKeys('sporim-test-key');
/** A perfectly good key that this app has simply never published. Forgery, in other words. */
const impostor = await makeKeys('sporim-test-key');

const verifier: PrivyVerifier = {
  keys: createLocalJWKSet({ keys: [signer.jwk] }),
  audience: APP_ID,
};

interface TokenOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly subject?: string;
  readonly expiresIn?: string;
  readonly key?: CryptoKey;
  readonly header?: JWTHeaderParameters;
}

function mintToken(options: TokenOptions = {}): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader(options.header ?? { alg: 'ES256', kid: signer.kid })
    .setIssuer(options.issuer ?? PRIVY_ISSUER)
    .setAudience(options.audience ?? APP_ID)
    .setSubject(options.subject ?? DID)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.key ?? signer.privateKey);
}

describe('verifyPrivyAccessToken', () => {
  it('returns the DID from a token this app actually issued', async () => {
    await expect(verifyPrivyAccessToken(await mintToken(), verifier)).resolves.toBe(DID);
  });

  it('refuses a token signed by a key we never published', async () => {
    const forged = await mintToken({ key: impostor.privateKey });
    await expect(verifyPrivyAccessToken(forged, verifier)).resolves.toBeNull();
  });

  it('refuses an expired token', async () => {
    const stale = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: signer.kid })
      .setIssuer(PRIVY_ISSUER)
      .setAudience(APP_ID)
      .setSubject(DID)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(signer.privateKey);
    await expect(verifyPrivyAccessToken(stale, verifier)).resolves.toBeNull();
  });

  it('refuses a token from another issuer', async () => {
    const wrong = await mintToken({ issuer: 'https://auth.example.test' });
    await expect(verifyPrivyAccessToken(wrong, verifier)).resolves.toBeNull();
  });

  /**
   * The check that is easiest to leave out and worst to leave out. Privy signs tokens for
   * every application on the platform with the same infrastructure, so this token is not
   * forged — it is genuine, correctly signed, and for somebody else's app. Anyone who can
   * create a Privy app could otherwise mint themselves a session here.
   */
  it('refuses a genuine token minted for a different Privy app', async () => {
    const otherApp = await mintToken({ audience: OTHER_APP_ID });
    await expect(verifyPrivyAccessToken(otherApp, verifier)).resolves.toBeNull();
  });

  it('refuses a token whose subject is not a Privy DID', async () => {
    const impersonation = await mintToken({ subject: 'admin' });
    await expect(verifyPrivyAccessToken(impersonation, verifier)).resolves.toBeNull();
  });

  it('refuses an unsigned token that claims alg none', async () => {
    // Hand-built: `jose` will not sign one of these, which is the point of trying it.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ iss: PRIVY_ISSUER, aud: APP_ID, sub: DID, exp: 2_000_000_000 }),
    ).toString('base64url');
    await expect(verifyPrivyAccessToken(`${header}.${body}.`, verifier)).resolves.toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['not-a-token', 'garbage'],
    ['a.b.c', 'three empty segments'],
  ])('refuses %s (%s) without throwing', async (token) => {
    await expect(verifyPrivyAccessToken(token, verifier)).resolves.toBeNull();
  });
});

describe('isPrivyDid', () => {
  it('accepts what Privy issues', () => {
    expect(isPrivyDid(DID)).toBe(true);
  });

  it.each([
    ['did:privy:', 'the prefix alone'],
    ['did:ethr:0xabc', 'another DID method'],
    [`did:privy:${'x'.repeat(200)}`, 'longer than the column'],
    [42, 'not a string'],
    [null, 'null'],
  ] as [string | number | null, string][])('rejects %s (%s)', (value) => {
    expect(isPrivyDid(value)).toBe(false);
  });
});
