/**
 * Who the request is from — the one place the rest of the server asks.
 *
 * Everything below this line already works against a verified Privy DID: `withUser` binds it
 * to `app.user_id`, every policy in `0002_rls.sql` compares against it, and every repository
 * function takes it as its first argument. What does not exist yet is the verification
 * itself — the provider on the client and the JWKS check on the server are the next item on
 * the critical path (STATUS.md).
 *
 * So this returns `null`, and that is a real answer rather than a placeholder: an anonymous
 * visitor is a case the product has to handle for good, and it is the case every screen is
 * currently exercising. What must never appear here is a development shortcut — a DID read
 * out of a cookie or an environment variable would be an unauthenticated login, and it would
 * be indistinguishable from the real thing on the day somebody deploys it.
 *
 * When Privy lands, this function verifies the token and returns the `sub`. Nothing that
 * calls it changes.
 */
export function currentPrivyDid(): Promise<string | null> {
  return Promise.resolve(null);
}
