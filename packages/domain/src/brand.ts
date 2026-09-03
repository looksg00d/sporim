/**
 * The one place the product name lives. Everything user-facing reads from here,
 * so renaming the product is a one-line change.
 */
export const BRAND = {
  name: 'SPORIM',
  tagline: 'Put money on it.',
  domain: 'sporim.app',
  cookiePrefix: 'sporim',
  draftStorageKey: 'sporim.draft.v1',
} as const;

export type Brand = typeof BRAND;
