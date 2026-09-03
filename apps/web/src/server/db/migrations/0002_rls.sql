-- 0002_rls.sql · privileges, row-level security, policies.
--
-- The threat this defends against is not a hostile database client — there is none, the
-- credential is server-only. It is a bug in our own server code: a repository function that
-- forgets to check who is asking. Authorization lives in the repository layer against the
-- verified Privy session; this file is the second line, so that a hole up there does not
-- become somebody else's bets on a screen.
--
-- The mechanism, verified end to end on the live database before it was written down
-- (docs/DECISIONS.md, 2026-09-03):
--
--   1. `sporim_app` is NOLOGIN NOBYPASSRLS and granted to the connecting role (0001).
--   2. Every table gets ENABLE **and** FORCE ROW LEVEL SECURITY.
--   3. Every application transaction runs `SET LOCAL ROLE sporim_app` and
--      `set_config('app.user_id', <privy did>, true)` before it touches a table.
--   4. Policies read `current_setting('app.user_id', true)`.
--
-- The property that makes this safe rather than merely present: `current_setting(…, true)`
-- returns NULL when the variable was never set, every comparison against NULL is NULL, and
-- a policy that does not evaluate to true does not pass a row. A transaction that forgets
-- step 3 therefore sees **zero rows** — it fails closed. `rls.test.ts` asserts exactly that,
-- because it is the difference between a safety net and a decoration.
--
-- FORCE is here even though the current owner (`xata`) has BYPASSRLS and so ignores it
-- anyway. It costs nothing and it is the difference between "policies apply" and "policies
-- apply until somebody changes who owns the table".

-- ---------------------------------------------------------------------------------------
-- Session helpers.
-- ---------------------------------------------------------------------------------------

-- The Privy DID of whoever this transaction is running for, or NULL outside a `withUser`
-- transaction. `nullif(…, '')` so an empty string cannot masquerade as an identity.
create function app_user_did() returns text
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

-- SECURITY DEFINER because it reads `users`, which is itself behind a policy that calls it.
-- Running as the owner breaks that circle. It is safe to hand out: it takes no arguments and
-- can only ever return the id belonging to the caller's own session variable.
create function app_current_user_id() returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id from users u where u.privy_did = app_user_did()
$$;

-- Visibility for everything hanging off a bet resolves through this one predicate.
--
-- SECURITY DEFINER is load-bearing rather than convenient: the policy on `participants` has
-- to ask a question *about* `participants`, and asking it through a normal function would
-- re-enter that policy and abort with "infinite recursion detected". Running as the owner
-- answers the question once, without policies, and returns a boolean.
--
-- Fails closed by construction: with no session variable `app_current_user_id()` is NULL,
-- `p.user_id = NULL` is never true, and the EXISTS is false for every row.
create function app_is_participant(target_bet uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from participants p
    where p.bet_id = target_bet
      and p.user_id = (select app_current_user_id())
  )
$$;

revoke all on function app_user_did() from public;
revoke all on function app_current_user_id() from public;
revoke all on function app_is_participant(uuid) from public;
grant execute on function app_user_did() to sporim_app;
grant execute on function app_current_user_id() to sporim_app;
grant execute on function app_is_participant(uuid) to sporim_app;

-- ---------------------------------------------------------------------------------------
-- Privileges.
-- ---------------------------------------------------------------------------------------
--
-- DELETE is granted nowhere. A bet that ends becomes `cancelled`, `refunded` or `resolved`;
-- an audit row is never withdrawn. Removing a row is an operations job done deliberately
-- through the owner role, not something the application can reach for by accident.

grant usage on schema public to sporim_app;

grant select, insert, update on users to sporim_app;
grant select, insert, update on bets to sporim_app;
grant select, insert, update on participants to sporim_app;
grant select, insert, update on claims to sporim_app;
grant select, insert, update on disputes to sporim_app;
-- Append-only: no UPDATE, and 0001's identity column needs no separate sequence grant.
grant select, insert on bet_events to sporim_app;
-- Write-only: you can join the waitlist, the application cannot read it back.
grant insert on waitlist to sporim_app;

-- ---------------------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------------------

alter table users enable row level security;
alter table users force row level security;
alter table bets enable row level security;
alter table bets force row level security;
alter table participants enable row level security;
alter table participants force row level security;
alter table claims enable row level security;
alter table claims force row level security;
alter table disputes enable row level security;
alter table disputes force row level security;
alter table bet_events enable row level security;
alter table bet_events force row level security;
alter table waitlist enable row level security;
alter table waitlist force row level security;

-- users ----------------------------------------------------------------------------------
--
-- Your own row and nothing else. Which means a bet card cannot get the opponent's name by
-- joining `users` — and must not: that is why `participants` carries `display_name` and
-- `wallet_address` of its own (0001). Everything a counterparty is allowed to see about you
-- is what you put on a bet you share with them.
--
-- The scalar subquery around the helper is not decoration: it makes the planner evaluate the
-- DID once for the statement instead of once per row.

create policy users_select_self on users
  for select to sporim_app
  using (privy_did = (select app_user_did()));

create policy users_insert_self on users
  for insert to sporim_app
  with check (privy_did = (select app_user_did()));

create policy users_update_self on users
  for update to sporim_app
  using (privy_did = (select app_user_did()))
  with check (privy_did = (select app_user_did()));

-- bets -----------------------------------------------------------------------------------

create policy bets_select_participant on bets
  for select to sporim_app
  using (app_is_participant(id));

-- You may only create a bet in your own name. The creator's `participants` row follows in
-- the same transaction; until it exists this is the only thing that ties the bet to anyone.
create policy bets_insert_own on bets
  for insert to sporim_app
  with check (creator_id = (select app_current_user_id()));

create policy bets_update_participant on bets
  for update to sporim_app
  using (app_is_participant(id))
  with check (app_is_participant(id));

-- participants ---------------------------------------------------------------------------
--
-- The INSERT check has two arms on purpose, and they cover the two moments a row appears:
-- the creator adding themselves to a bet nobody is on yet (`user_id` is theirs), and anyone
-- already on the bet naming the remaining roles (`app_is_participant`).

create policy participants_select_on_my_bets on participants
  for select to sporim_app
  using (app_is_participant(bet_id));

create policy participants_insert_on_my_bets on participants
  for insert to sporim_app
  with check (
    user_id = (select app_current_user_id())
    or app_is_participant(bet_id)
  );

create policy participants_update_on_my_bets on participants
  for update to sporim_app
  using (app_is_participant(bet_id))
  with check (app_is_participant(bet_id));

-- claims ---------------------------------------------------------------------------------

create policy claims_select_on_my_bets on claims
  for select to sporim_app
  using (app_is_participant(bet_id));

create policy claims_insert_on_my_bets on claims
  for insert to sporim_app
  with check (app_is_participant(bet_id));

create policy claims_update_on_my_bets on claims
  for update to sporim_app
  using (app_is_participant(bet_id))
  with check (app_is_participant(bet_id));

-- disputes -------------------------------------------------------------------------------

create policy disputes_select_on_my_bets on disputes
  for select to sporim_app
  using (app_is_participant(bet_id));

create policy disputes_insert_on_my_bets on disputes
  for insert to sporim_app
  with check (app_is_participant(bet_id));

create policy disputes_update_on_my_bets on disputes
  for update to sporim_app
  using (app_is_participant(bet_id))
  with check (app_is_participant(bet_id));

-- bet_events -----------------------------------------------------------------------------
--
-- Read and append, nothing else. There is no UPDATE or DELETE policy and no UPDATE or
-- DELETE privilege, so the audit trail is immutable to the application by two independent
-- mechanisms rather than by convention.

create policy bet_events_select_on_my_bets on bet_events
  for select to sporim_app
  using (app_is_participant(bet_id));

create policy bet_events_insert_on_my_bets on bet_events
  for insert to sporim_app
  with check (app_is_participant(bet_id));

-- waitlist -------------------------------------------------------------------------------
--
-- Anyone may add themselves — the landing form runs with no user context at all — and
-- nobody may read the list. `with check (true)` is not a hole here: INSERT is the only
-- privilege granted, and the absence of a SELECT policy means every read returns nothing
-- even for a query the application manages to issue.

create policy waitlist_insert_anyone on waitlist
  for insert to sporim_app
  with check (true);
