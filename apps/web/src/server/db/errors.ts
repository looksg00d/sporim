/**
 * What a repository is allowed to fail with. Repositories return `Result`, like the domain:
 * an unauthorized caller is an expected outcome of a shared link, not an exception.
 *
 * `NOT_FOUND` deliberately covers "no such bet" *and* "not yours". Distinguishing them would
 * turn the bet id into an oracle for whether a given bet exists.
 */
export type RepoError =
  | { readonly code: 'NOT_FOUND'; readonly what: string }
  | { readonly code: 'FORBIDDEN'; readonly reason: string }
  | { readonly code: 'CONFLICT'; readonly reason: string }
  | { readonly code: 'INVALID'; readonly issues: readonly string[] };

export function notFound(what: string): RepoError {
  return { code: 'NOT_FOUND', what };
}

export function forbidden(reason: string): RepoError {
  return { code: 'FORBIDDEN', reason };
}
