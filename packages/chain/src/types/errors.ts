/**
 * Every way a chain call can fail, named so the UI can show a person something true without
 * ever seeing a raw RPC error. `message` is written for a screen; `cause` never is.
 */
export type ChainErrorCode =
  | 'WALLET_NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_USDC'
  | 'INSUFFICIENT_SOL'
  | 'NO_TOKEN_ACCOUNT'
  | 'BET_NOT_FOUND'
  | 'INVALID_STATE'
  | 'NOT_AUTHORIZED'
  | 'ALREADY_ACCEPTED'
  | 'DEADLINE_NOT_REACHED'
  | 'WINDOW_CLOSED'
  | 'VALIDATION_FAILED'
  | 'SIMULATION_FAILED'
  | 'RPC_UNAVAILABLE'
  | 'TX_TIMEOUT'
  | 'TX_DROPPED'
  | 'UNKNOWN';

export interface ChainError {
  readonly code: ChainErrorCode;
  /** User-safe. Never the program's raw error string or an RPC message. */
  readonly message: string;
  readonly retriable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
  /** The original error, for logs. Never surfaced to the UI. */
  readonly cause?: unknown;
}
