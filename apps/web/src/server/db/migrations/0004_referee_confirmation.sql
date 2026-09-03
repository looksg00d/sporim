-- 0004_referee_confirmation.sql · the referee's own capability, and the record of taking it.
--
-- Until now a referee was a name the creator typed on the fourth screen. Nobody asked the
-- person behind it, and yet their silence was about to decide who keeps the money
-- (`settleUnrefereed`). The domain now splits the two cases — a confirmed referee's silence
-- upholds the claim, an unconfirmed one's refunds both sides — and this file gives the
-- database the two facts that split needs: a way for that person to say yes, and a way for
-- them to reach the bet before they have.
--
-- ## Two capabilities, two secrets, two places
--
-- `bets.short_code` is already the accept capability: "anyone with this link can accept"
-- (TRUST_COPY.linkWarning), spent at `/b/<code>`. Refereeing is a different power over the
-- same bet, so it gets a different secret, spent at `/r/<token>`. One shared link would mean
-- whoever opened it first chose their own role.
--
-- The token lives in its own table rather than in a column on `bets`, and that is the whole
-- reason this table exists. Row-level security is row-level: a policy that lets the opponent
-- read their bet lets them read **every column of it**. A token sitting on that row would be
-- readable by the very person who must not have it — they could hand it to an accomplice and
-- buy themselves a judge. A separate table gets its own policy, and that policy names the
-- creator alone.
--
-- The shapes cannot be confused for one another either: a short code is exactly 8 base58
-- characters and a referee token exactly 32, so `isShortCode` and `isRefereeToken` are
-- mutually exclusive and a token pasted into the accept route is refused before it reaches
-- SQL. 32 base58 characters is roughly 187 bits; the short code's 8 is 46, which is the right
-- size for something forwarded in a chat and the wrong size for a role.
--
-- ## Authorizing somebody who is not a participant yet
--
-- 0003 left a note that `accept` is not expressible: the claimant is by definition not on the
-- bet, so `app_is_participant` refuses them, and it is right to. Claiming the referee role
-- has exactly that shape, and the answer taken here is the one that note asked for — a named
-- capability rather than a widened membership rule.
--
-- Possession of the token is the authorizer, and it is checked **server-side**: the token
-- travels into the transaction through `set_config('app.referee_token', …, true)`, exactly
-- as the Privy DID does, and the policies compare it against the stored row. Nothing about
-- the caller's claimed role is taken from the client. With the variable unset the helper is
-- NULL, `token = NULL` is never true, and the policies pass no rows — the same fail-closed
-- shape as `app_user_did()`.

-- ---------------------------------------------------------------------------------------
-- referee_invites
-- ---------------------------------------------------------------------------------------
--
-- One row per bet that named a referee. No UPDATE and no DELETE privilege: a capability that
-- can be silently re-pointed is not a capability. Re-issuing a leaked link is a product
-- decision with its own screen and its own audit row, not something a repository does.

create table referee_invites (
  bet_id uuid primary key references bets (id),
  token text not null unique,
  created_at timestamptz not null default date_trunc('second', now()),

  constraint referee_invites_token_shape check (token ~ '^[1-9A-HJ-NP-Za-km-z]{32}$')
);

-- ---------------------------------------------------------------------------------------
-- participants.confirmed_at
-- ---------------------------------------------------------------------------------------

-- When this person opened their link and took the role. NULL means named but unconfirmed,
-- which is what `Referee.confirmedAtSeconds` means in the domain and what makes their silence
-- decide nothing.
alter table participants add column confirmed_at timestamptz;

-- The binding to a real account. A confirmation has to belong to somebody who signed in:
-- without a `users` row there is nobody who agreed, and `resolveViewerRole` would never match
-- them back to the referee seat afterwards.
--
-- Deliberately not restricted to `role = 'referee'`. The opponent's acceptance is the same
-- fact about a different seat, and it belongs in the same column when the accept flow lands.
alter table participants add constraint participants_confirmed_needs_user check (
  confirmed_at is null or user_id is not null
);

-- ---------------------------------------------------------------------------------------
-- A confirmation cannot be taken back.
-- ---------------------------------------------------------------------------------------
--
-- The other side stakes money partly on the strength of "Anya has taken the role" being on
-- the card. If the seat could be vacated afterwards, a referee and one party could flip a
-- dispute from "the claim stands" to "everybody refunded" between the dispute opening and its
-- deadline — which is the free option the bond exists to prevent.
--
-- A CHECK constraint cannot see the previous row, so this is a trigger. It is deliberately
-- narrow: it says nothing at all about a row that has never been confirmed.

create function participants_confirmation_is_permanent() returns trigger
language plpgsql
as $$
begin
  if old.confirmed_at is not null then
    if new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'a confirmation cannot be withdrawn or moved';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'a confirmed role cannot change hands';
    end if;
  end if;
  return new;
end
$$;

create trigger participants_confirmation_is_permanent before update on participants
  for each row execute function participants_confirmation_is_permanent();

-- ---------------------------------------------------------------------------------------
-- Session helpers for the capability.
-- ---------------------------------------------------------------------------------------

-- The referee token this transaction is running with, or NULL outside a `withRefereeToken`
-- transaction. `nullif(…, '')` so an empty string cannot masquerade as a secret — the same
-- reason `app_user_did()` does it, and the same reason it matters: once a custom GUC has been
-- touched in a session it reverts to `''` rather than to unset.
create function app_referee_token() returns text
language sql
stable
as $$
  select nullif(current_setting('app.referee_token', true), '')
$$;

-- The one bet that token unlocks, or NULL. SECURITY DEFINER because the token holder is not
-- allowed to read `referee_invites` themselves — only the creator is — so the lookup has to
-- happen on their behalf without handing them the table.
create function app_referee_token_bet() returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.bet_id from referee_invites i where i.token = (select app_referee_token())
$$;

-- May the caller take the referee seat on this bet? Four conditions, each load-bearing:
--
--   1. They are signed in. A confirmation with no account behind it is not a confirmation,
--      and an anonymous caller must not be able to touch the row at all.
--   2. They hold the token for this bet. That is the entire authorization, and it is never
--      inferred from anything the client says about itself.
--   3. The seat is vacant, or already theirs. A referee who confirmed cannot be displaced by
--      the next person the link gets forwarded to.
--   4. **They are not on the bet.** Neither party may become the judge of their own case.
--      This is the crossing the product forbids, enforced here as well as in the repository —
--      because one of those two places will eventually be edited by somebody who has
--      forgotten the rule.
create function app_may_claim_referee(target_bet uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select app_current_user_id()) is not null
    and target_bet = (select app_referee_token_bet())
    and exists (
      select 1 from participants p
      where p.bet_id = target_bet
        and p.role = 'referee'
        and (p.user_id is null or p.user_id = (select app_current_user_id()))
    )
    and not exists (
      select 1 from participants p
      where p.bet_id = target_bet
        and p.role <> 'referee'
        and p.user_id = (select app_current_user_id())
    )
$$;

revoke all on function app_referee_token() from public;
revoke all on function app_referee_token_bet() from public;
revoke all on function app_may_claim_referee(uuid) from public;
grant execute on function app_referee_token() to sporim_app;
grant execute on function app_referee_token_bet() to sporim_app;
grant execute on function app_may_claim_referee(uuid) to sporim_app;

-- ---------------------------------------------------------------------------------------
-- Privileges and row-level security for the new table.
-- ---------------------------------------------------------------------------------------

grant select, insert on referee_invites to sporim_app;

alter table referee_invites enable row level security;
alter table referee_invites force row level security;

-- The creator writes it when the bet is created and reads it back to send the link. Nobody
-- else, ever — that is the point of the table. The token holder never selects this row; the
-- SECURITY DEFINER resolver above answers on their behalf and returns only a bet id.
create policy referee_invites_select_creator on referee_invites
  for select to sporim_app
  using (app_is_bet_creator(bet_id));

create policy referee_invites_insert_creator on referee_invites
  for insert to sporim_app
  with check (app_is_bet_creator(bet_id));

-- ---------------------------------------------------------------------------------------
-- What the token opens.
-- ---------------------------------------------------------------------------------------
--
-- Permissive policies are OR'd, so each of these widens the existing rules by exactly one
-- case: the holder of a referee token, for the one bet that token names. Everybody else sees
-- what they saw before, and a transaction that sets no token sees nothing new at all.

-- Read the terms before agreeing to judge them. Somebody asked to take a stake-less role in
-- an argument about money is entitled to see what the argument is, before signing in.
create policy bets_select_by_referee_token on bets
  for select to sporim_app
  using (id = (select app_referee_token_bet()));

-- And who is on it: the card names both parties, and "between whom" is half of the decision
-- to accept. `participants` carries its own `display_name`, so this is the only way to answer
-- that — `users` stays readable to its owner alone.
create policy participants_select_by_referee_token on participants
  for select to sporim_app
  using (bet_id = (select app_referee_token_bet()));

-- The case file. A referee arriving at a bet that is already disputed has to see the claim
-- and the dispute — that *is* the job. It also stops the mapper from assembling a bet in
-- state `disputed` with no dispute attached, which would be a lie told by omission.
create policy claims_select_by_referee_token on claims
  for select to sporim_app
  using (bet_id = (select app_referee_token_bet()));

create policy disputes_select_by_referee_token on disputes
  for select to sporim_app
  using (bet_id = (select app_referee_token_bet()));

-- Taking the seat. UPDATE rather than INSERT: the row already exists, written with the bet
-- when the creator named them, and what changes is that it acquires a person.
create policy participants_referee_claim on participants
  for update to sporim_app
  using (role = 'referee' and app_may_claim_referee(bet_id))
  with check (role = 'referee' and app_may_claim_referee(bet_id));
