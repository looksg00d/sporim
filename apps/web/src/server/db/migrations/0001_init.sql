-- 0001_init.sql · roles, enums, tables, indexes.
--
-- Conventions this file holds to everywhere:
--
--   * Money is `bigint` USDC base units (6 decimals). Not numeric, not float, ever. The
--     domain's `UsdcAmount` is a bigint and the on-chain program will use u64; a third
--     representation with a decimal point in it is a rounding bug waiting for a payout.
--
--   * Time is `timestamptz` truncated to whole seconds, because the domain's clock is unix
--     seconds (`Bet.createdAtSeconds`, `deadlineSeconds`, …). Raw epochs in a bigint would
--     round-trip just as exactly, but they throw away every date function and the timezone
--     contract, and this table is read by people during an incident. The column defaults
--     truncate so a stored instant never carries a fraction the domain cannot represent.
--
--   * Domain enums become real Postgres enum types rather than a CHECK repeated per table.
--     Six tables key off the same closed sets; an enum names each set once, `\d` documents
--     itself, and `enums.test.ts` compares `enum_range` against the domain's `as const`
--     arrays so the two cannot drift silently. The price is that adding a label later needs
--     its own migration (`ALTER TYPE … ADD VALUE`, which cannot be used in the transaction
--     that adds it) — which is exactly what a numbered migration file is for. Bringing Dare
--     back out of its parking space (docs/DECISIONS.md, 2026-09-03) is that migration.
--
--   * Nothing here is ever deleted. Bets end in `cancelled`/`refunded`/`resolved`; the app
--     role is never granted DELETE (see 0002). `ON DELETE` clauses are therefore RESTRICT by
--     omission, which is the answer we want.

-- ---------------------------------------------------------------------------------------
-- The application role.
-- ---------------------------------------------------------------------------------------
--
-- The connecting role (`xata`) has BYPASSRLS, so policies are invisible to it and an RLS
-- design that stops there is theatre — a first probe "worked" while quietly returning other
-- people's rows. Every application transaction therefore switches to `sporim_app`, which is
-- NOLOGIN (nothing can connect as it) and NOBYPASSRLS (policies actually apply).
--
-- Created idempotently: the role already exists on the live database from the manual probe,
-- and the schema still has to reproduce from nothing on a fresh branch.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sporim_app') then
    create role sporim_app nologin nobypassrls;
  end if;
end
$$;

-- Re-asserted rather than assumed: a role that picked up LOGIN or BYPASSRLS by hand would
-- silently disable the whole second line of defence.
alter role sporim_app nologin nobypassrls;

-- `SET LOCAL ROLE` only works for a role the session user is a member of.
grant sporim_app to current_user;

-- ---------------------------------------------------------------------------------------
-- Extensions.
-- ---------------------------------------------------------------------------------------

-- Case-insensitive uniqueness carried by the column type instead of by a functional index:
-- every query written later gets the same semantics without anyone remembering `lower()`.
create extension if not exists citext;

-- ---------------------------------------------------------------------------------------
-- Enums — mirrors of packages/domain/src/types/bet.ts and state/machine.ts.
-- ---------------------------------------------------------------------------------------

create type bet_format as enum ('bet', 'commit');

create type bet_state as enum (
  'draft', 'open', 'active', 'claimed', 'disputed', 'resolved', 'refunded', 'cancelled'
);

create type decision_mode as enum ('mutual', 'referee');

create type bet_outcome as enum ('creator_wins', 'opponent_wins', 'draw');

create type party_side as enum ('creator', 'opponent');

-- `VIEWER_ROLES` minus `observer`: an observer is the absence of a participant row, not a
-- kind of one. `resolveViewerRole` returns `observer` for exactly the people missing here.
create type participant_role as enum ('creator', 'opponent', 'referee', 'beneficiary');

create type beneficiary_kind as enum ('friend', 'charity', 'vault');

create type chain_network as enum ('mock', 'devnet', 'mainnet-beta');

-- Every move anyone can make on a bet, `BET_ACTIONS` verbatim. The audit trail names the
-- action, not a free-text description, so a transition that the state machine cannot produce
-- cannot be written down either.
create type bet_action as enum (
  'share',
  'accept',
  'cancel',
  'expireUnaccepted',
  'submitClaim',
  'confirmClaim',
  'disputeClaim',
  'settleUncontested',
  'refereeResolve',
  'settleUnrefereed',
  'refundExpired'
);

-- ---------------------------------------------------------------------------------------
-- Shared triggers.
-- ---------------------------------------------------------------------------------------

create function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := date_trunc('second', now());
  return new;
end
$$;

-- ---------------------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------------------
--
-- The Privy DID is the identity. It is what the verified session carries, what
-- `app.user_id` holds inside a transaction, and what every policy compares against; the
-- uuid `id` exists only so foreign keys are 16 bytes instead of a variable-length string.

create table users (
  id uuid primary key default gen_random_uuid(),
  privy_did text not null unique,
  wallet_address text unique,
  handle citext unique,
  display_name text,
  -- Deliberately not unique: Privy is the identity provider, and the same person reaching us
  -- once through Google and once through email login is two DIDs with one address. Rejecting
  -- the second login would be a bug, not a safeguard.
  email citext,
  avatar_url text,
  created_at timestamptz not null default date_trunc('second', now()),
  updated_at timestamptz not null default date_trunc('second', now()),

  constraint users_privy_did_shape check (privy_did <> '' and length(privy_did) <= 200),
  constraint users_wallet_shape check (
    wallet_address is null or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  ),
  constraint users_handle_shape check (handle is null or length(handle) between 2 and 64)
);

create index users_email_idx on users (email) where email is not null;

create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------
-- bets
-- ---------------------------------------------------------------------------------------
--
-- `id` is also the on-chain bet id, so `/b/<uuid>` derives the PDA without a lookup.
--
-- Only `creator_id` lives here. The other three parties (opponent, referee, beneficiary)
-- live in `participants` and nowhere else — see the note on that table for why the creator
-- is the exception.

create table bets (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  format bet_format not null,
  state bet_state not null default 'draft',
  terms text not null,
  terms_hash text not null,
  stake_creator bigint not null,
  stake_opponent bigint not null default 0,
  decision_mode decision_mode not null,
  creator_id uuid not null references users (id),
  outcome bet_outcome,
  fee_bps integer not null,
  chain chain_network not null,
  create_tx text,
  accept_tx text,
  settle_tx text,
  created_at timestamptz not null default date_trunc('second', now()),
  accept_deadline_at timestamptz not null,
  deadline_at timestamptz not null,
  updated_at timestamptz not null default date_trunc('second', now()),

  constraint bets_short_code_shape check (short_code ~ '^[1-9A-HJ-NP-Za-km-z]{8}$'),
  constraint bets_terms_hash_shape check (terms_hash ~ '^[0-9a-f]{64}$'),
  constraint bets_terms_length check (length(terms) between 10 and 280),

  -- MIN_STAKE / MAX_STAKE from constants.ts, in base units. The numbers are repeated here
  -- rather than imported because this constraint has to hold against a client that skipped
  -- every zod schema on the way in.
  constraint bets_stake_creator_bounds check (stake_creator between 1000000 and 100000000),
  constraint bets_stake_opponent_bounds check (stake_opponent between 0 and 100000000),

  -- `calculateSettlement` rejects anything else: a Bet is symmetric (asymmetric stakes are
  -- odds, which is a gambling profile — docs/05), and a one-sided format has no second stake.
  constraint bets_stakes_match_format check (
    case when format = 'bet' then stake_opponent = stake_creator else stake_opponent = 0 end
  ),

  -- A one-sided format has nobody with an interest in telling the truth on the other side,
  -- so mutual confirmation is meaningless there. `draftReducer` enforces the same rule.
  constraint bets_one_sided_needs_referee check (
    format = 'bet' or decision_mode = 'referee'
  ),

  constraint bets_fee_bps_bounds check (fee_bps between 0 and 1000),
  constraint bets_deadline_after_creation check (deadline_at > created_at),
  constraint bets_accept_deadline_sane check (accept_deadline_at <= deadline_at),

  -- An outcome is what `resolved` means. `refunded` and `cancelled` have no winner, and a
  -- live bet has no outcome yet.
  constraint bets_outcome_only_when_resolved check (outcome is null or state = 'resolved')
);

create index bets_creator_created_idx on bets (creator_id, created_at desc);

-- The sweep that finds work to do: bets past a deadline that have not finished. Partial, so
-- the index stays the size of the open book rather than of all history.
create index bets_live_deadline_idx on bets (state, deadline_at)
  where state not in ('resolved', 'refunded', 'cancelled');

create trigger bets_set_updated_at before update on bets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------
-- participants
-- ---------------------------------------------------------------------------------------
--
-- One row per role on a bet — the single source of truth for who is on it, and the table
-- every RLS policy in 0002 resolves visibility through. `bets.creator_id` is the one
-- duplicate, and it earns its place twice over: a bet cannot exist without a creator (so the
-- column is NOT NULL, which a join can never be), and the INSERT policy needs a predicate
-- that holds before any participant row exists.
--
-- `wallet_address` and `display_name` are copied from `users` rather than joined. That is
-- deliberate, not laziness: `users` is readable only by its owner, so a join to fetch the
-- opponent's name would return nothing. This table is the projection of the domain's `Party`,
-- and a `Party` is what the bet card shows.

create table participants (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references bets (id),
  role participant_role not null,
  -- Null until the person exists: the creator names an opponent by handle before that
  -- handle has an account, and `Party.userId` is nullable for exactly this reason.
  user_id uuid references users (id),
  wallet_address text,
  display_name text,
  -- The handle the creator typed. Survives so an invite can still be matched after the fact.
  invite_ref text,
  -- Only ever set on the beneficiary row; mirrors `Bet.beneficiary.kind`.
  beneficiary_kind beneficiary_kind,
  -- The scrawl, as stroke points: `{"kind":"drawn","strokes":[[…]],"height":n}` or
  -- `{"kind":"typed","name":"…"}`. jsonb rather than a blob because the OG card renders the
  -- points through satori, and jsonb numbers are exact `numeric` — no float rounds a stroke.
  signature jsonb,
  signed_at timestamptz,
  joined_at timestamptz not null default date_trunc('second', now()),

  constraint participants_one_row_per_role unique (bet_id, role),
  constraint participants_wallet_shape check (
    wallet_address is null or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  ),
  -- Biconditional, not "only on that row": `Bet.beneficiary` is a `Party & { kind }`, so a
  -- beneficiary without a kind is not a thing the domain can represent and must not exist.
  constraint participants_beneficiary_kind_placement check (
    (beneficiary_kind is not null) = (role = 'beneficiary')
  ),
  constraint participants_signature_shape check (
    signature is null or signature ->> 'kind' in ('drawn', 'typed')
  ),
  constraint participants_signed_at_with_signature check (
    (signature is null) = (signed_at is null)
  )
);

-- Drives `app_is_participant()`, which every policy calls. Leading column is `user_id`
-- because the lookup is always "is this person on this bet".
create index participants_user_bet_idx on participants (user_id, bet_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------------------
-- claims
-- ---------------------------------------------------------------------------------------
--
-- `Bet.claim` is a single nullable value and the state machine admits exactly one: from
-- `claimed` the only moves are confirm, dispute and settle. The unique constraint makes that
-- structural instead of hopeful.

create table claims (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null unique references bets (id),
  by_side party_side not null,
  claimant_user_id uuid references users (id),
  outcome bet_outcome not null,
  note text,
  -- Phase 1.1 (evidence upload). Present now so the audit rows do not have to be rewritten.
  evidence_url text,
  tx text,
  claimed_at timestamptz not null default date_trunc('second', now()),
  window_ends_at timestamptz not null,

  constraint claims_note_length check (note is null or length(note) <= 500),
  constraint claims_window_after_claim check (window_ends_at > claimed_at)
);

create index claims_claimant_idx on claims (claimant_user_id) where claimant_user_id is not null;

-- ---------------------------------------------------------------------------------------
-- disputes
-- ---------------------------------------------------------------------------------------

create table disputes (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null unique references bets (id),
  claim_id uuid not null references claims (id),
  by_side party_side not null,
  disputer_user_id uuid references users (id),
  bond_amount bigint not null,
  reason text,
  -- Null until a referee rules. `settleUnrefereed` leaves it null on purpose: the audit has
  -- to show the difference between "the referee said draw" and "the referee never came",
  -- because the bond goes to opposite people in those two cases (money/settlement.ts).
  resolution bet_outcome,
  resolver_user_id uuid references users (id),
  resolved_at timestamptz,
  tx text,
  opened_at timestamptz not null default date_trunc('second', now()),
  referee_deadline_at timestamptz not null,

  -- MIN_DISPUTE_BOND / MAX_DISPUTE_BOND, in base units.
  constraint disputes_bond_bounds check (bond_amount between 1000000 and 25000000),
  constraint disputes_reason_length check (reason is null or length(reason) <= 500),
  constraint disputes_deadline_after_opening check (referee_deadline_at > opened_at),
  constraint disputes_resolution_together check (
    (resolution is null) = (resolved_at is null)
  )
);

create index disputes_disputer_idx on disputes (disputer_user_id) where disputer_user_id is not null;
create index disputes_resolver_idx on disputes (resolver_user_id) where resolver_user_id is not null;

-- ---------------------------------------------------------------------------------------
-- bet_events
-- ---------------------------------------------------------------------------------------
--
-- The append-only audit: one row per state transition, naming the `BetAction` that caused
-- it. Append-only is enforced by omission in 0002 — the app role gets SELECT and INSERT and
-- no UPDATE or DELETE policy, so there is no statement it can issue that rewrites history.
--
-- `actor_user_id` is null for the permissionless actions (`settleUncontested`,
-- `expireUnaccepted`, `settleUnrefereed`, `refundExpired`). Those are meant to be callable by
-- anyone — if we disappear, the money still comes out — so "nobody in particular did this"
-- is a real answer and not missing data.

create table bet_events (
  id bigint generated always as identity primary key,
  bet_id uuid not null references bets (id),
  action bet_action not null,
  from_state bet_state,
  to_state bet_state not null,
  actor_user_id uuid references users (id),
  actor_role participant_role,
  tx text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default date_trunc('second', now())
);

create index bet_events_bet_idx on bet_events (bet_id, id);
create index bet_events_action_time_idx on bet_events (action, occurred_at desc);
create index bet_events_actor_idx on bet_events (actor_user_id) where actor_user_id is not null;

-- ---------------------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------------------
--
-- Write-only for the application (0002 grants INSERT and defines no SELECT policy): the
-- landing page must be able to add you and must not be able to read the list back, so a bug
-- in a server action cannot become an email dump.

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  position bigint generated always as identity,
  email citext not null unique,
  handle text,
  source text not null default 'landing',
  ref_code text,
  utm jsonb not null default '{}'::jsonb,
  country text,
  -- sha256(ip + pepper) and sha256(user agent): enough to spot a flood, not enough to
  -- identify anyone if the table leaks.
  ip_hash text,
  ua_hash text,
  created_at timestamptz not null default date_trunc('second', now()),

  constraint waitlist_email_length check (length(email) between 3 and 254),
  constraint waitlist_country_shape check (country is null or country ~ '^[A-Z]{2}$')
);

create index waitlist_created_idx on waitlist (created_at desc);
