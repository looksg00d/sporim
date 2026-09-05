-- 0011_accept_by_link.sql · the second person, and how a link lets them in.
--
-- This closes the last gap in the loop. A creator makes a bet, the page hands them
-- `sporim.fun/b/<code>` under the words "anyone with this link can accept" — and until now the
-- friend who opened it got NOT_FOUND, because the short code *named* a bet without authorizing
-- anybody to read one. No bet in the product could acquire a second side.
--
-- ## Why there is no new table
--
-- 0004 put the referee's token in a table of its own, and its argument was specific: row-level
-- security is row-level, so a token stored on `bets` would be readable by everyone who may read
-- that bet — including the opponent, who could then buy themselves a judge.
--
-- That argument does not reach the short code. It is already a column on `bets`, already
-- readable by every participant, already printed on the card and read aloud across a table.
-- It is *meant* to be passed around. Giving it a second table would be hiding a thing from
-- nobody. 0003 anticipated exactly this and left both doors open: "a policy keyed on the short
-- code, or a narrow SECURITY DEFINER join". This takes the first.
--
-- ## What that costs, and what pays for it
--
-- Eight base58 characters is about 46 bits, against the 187 of a referee token. The mitigation
-- is condition 3 in `app_may_accept_bet` below: the capability only opens a bet that is still
-- `open`. A guessed code therefore buys exactly what a leaked link buys — the chance to take a
-- side of a bet nobody has taken yet — and `TRUST_COPY.linkWarning` already tells the creator
-- that in as many words. Once somebody accepts, the code stops being a way in and membership
-- carries both of them.
--
-- ## The two arms
--
-- `confirmReferee` only ever UPDATEs, because the referee's row is written when the bet is
-- created. The opponent's row exists only if the creator typed a handle on the fourth screen
-- (`named()` in `create-bet.ts`), so acceptance has to be able to INSERT one as well — and
-- `participants_one_row_per_role` makes the two mutually exclusive rather than combinable.

-- ---------------------------------------------------------------------------------------
-- Session helpers for the capability.
-- ---------------------------------------------------------------------------------------

-- The short code this transaction is running with, or NULL outside a `withShortCode`
-- transaction. `nullif(…, '')` for the same reason as everywhere else: once a custom GUC has
-- been touched in a session it reverts to `''` rather than to unset, and an empty string must
-- never be able to masquerade as a secret.
create function app_short_code() returns text
language sql
stable
as $$
  select nullif(current_setting('app.short_code', true), '')
$$;

-- The one bet that code unlocks, or NULL.
--
-- SECURITY DEFINER for a different reason than 0004's: the caller may well be entitled to read
-- `bets`, and that is the problem — a plain `select id from bets where short_code = …` would be
-- filtered by their own policies and could answer from a bet they are a participant of. The
-- answer has to be the code's alone, and a definer function is how it stays that.
create function app_short_code_bet() returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id from bets b where b.short_code = (select app_short_code())
$$;

-- May the caller take the other side of this bet? Five conditions, each load-bearing:
--
--   1. They are signed in. An acceptance with no account behind it is not an acceptance, and
--      an anonymous caller must not be able to touch the row at all.
--   2. They hold the code for this bet. That is the whole authorization, and it is never
--      inferred from anything the client says about itself.
--   3. **The bet is still open.** This is the condition that makes a 46-bit secret defensible,
--      and it is also just true: there is no other side to take once somebody has taken it.
--      Note it is the state that is checked and not the accept deadline — a deadline is a
--      moving target that belongs to the domain, and `openActions` already refuses a stale
--      one. Here we only need the seat to exist.
--   4. The seat is vacant, or already theirs. Whoever accepted cannot be displaced by the next
--      person the link is forwarded to, and re-opening the link is not an error.
--   5. **They are not already on the bet.** The creator cannot take their own other side, and
--      a referee cannot become a party — the same crossing 0004 forbids from the other
--      direction, enforced here as well as in the repository, because one of those two places
--      will eventually be edited by somebody who has forgotten the rule.
create function app_may_accept_bet(target_bet uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select app_current_user_id()) is not null
    and target_bet = (select app_short_code_bet())
    and exists (
      select 1 from bets b where b.id = target_bet and b.state = 'open'
    )
    and not exists (
      select 1 from participants p
      where p.bet_id = target_bet
        and p.role = 'opponent'
        and p.user_id is not null
        and p.user_id <> (select app_current_user_id())
    )
    and not exists (
      select 1 from participants p
      where p.bet_id = target_bet
        and p.role <> 'opponent'
        and p.user_id = (select app_current_user_id())
    )
$$;

revoke all on function app_short_code() from public;
revoke all on function app_short_code_bet() from public;
revoke all on function app_may_accept_bet(uuid) from public;
grant execute on function app_short_code() to sporim_app;
grant execute on function app_short_code_bet() to sporim_app;
grant execute on function app_may_accept_bet(uuid) to sporim_app;

-- ---------------------------------------------------------------------------------------
-- What the code opens.
-- ---------------------------------------------------------------------------------------
--
-- Permissive policies are OR'd, so each of these widens the existing rules by exactly one
-- case: "…or this transaction is carrying the code for this bet".
--
-- Reading is deliberately not gated on the bet still being open. Somebody who accepted needs
-- to keep reading it, and by then they are a participant anyway; more to the point, a person
-- who opens a link to a bet that was taken an hour ago deserves the screen that says so rather
-- than a not-found. Only *acting* is gated, by `app_may_accept_bet`.

create policy bets_select_by_short_code on bets
  for select to sporim_app
  using (id = (select app_short_code_bet()));

create policy participants_select_by_short_code on participants
  for select to sporim_app
  using (bet_id = (select app_short_code_bet()));

-- The two arms. Both name `role = 'opponent'` explicitly: the capability opens exactly one
-- seat, and a policy that merely said `app_may_accept_bet(bet_id)` would let the holder write
-- any row on the bet, including the referee's.
create policy participants_accept_insert on participants
  for insert to sporim_app
  with check (role = 'opponent' and app_may_accept_bet(bet_id));

create policy participants_accept_update on participants
  for update to sporim_app
  using (role = 'opponent' and app_may_accept_bet(bet_id))
  with check (role = 'opponent' and app_may_accept_bet(bet_id));

-- No new policy for `update bets set state = 'active'`. `bets_update_participant` already
-- allows it, because the participant row is written by the *previous* statement in the same
-- transaction and `app_is_participant` sees it. That is the mirror image of the trap 0008
-- documents: there the problem was a RETURNING row judged inside the statement that created
-- it; here the two writes are separate statements and the ordering is what makes it work.

-- ---------------------------------------------------------------------------------------
-- The confirmation guard grows its second arm.
-- ---------------------------------------------------------------------------------------
--
-- 0006's trigger raises on any write of `confirmed_at` that `app_may_claim_referee` does not
-- bless, which would reject every acceptance. Both 0005 and 0006 said in their own comments
-- what to do about it when this day came — "grows a second arm rather than losing this one" —
-- and this is that arm. The referee's condition is untouched.
--
-- `create or replace` rather than a drop: the trigger keeps pointing at the same function.

create or replace function participants_confirmation_guard() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Already taken: the seat is frozen. Neither the timestamp nor the person may move.
  if tg_op = 'UPDATE' and old.confirmed_at is not null then
    if new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'a confirmation cannot be withdrawn or moved';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'a confirmed role cannot change hands';
    end if;
    return new;
  end if;

  -- Being taken — by INSERT or by a first-time UPDATE. Consent belongs to the person
  -- consenting, so the only thing that may write it is a transaction carrying their own
  -- capability: the referee's token for the referee's seat, the bet's short code for the
  -- opponent's. Neither one opens the other's chair.
  if new.confirmed_at is not null
     and not app_may_claim_referee(new.bet_id)
     and not app_may_accept_bet(new.bet_id) then
    raise exception 'only the holder of the invitation can take a role';
  end if;

  return new;
end;
$$;
