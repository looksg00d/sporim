-- 0003_participant_insert_scope.sql · narrow who may put themselves on a bet.
--
-- `participants_insert_on_my_bets` in 0002 had a self-insert arm — `user_id =
-- app_current_user_id()` — so that a creator could add themselves to a bet nobody was on
-- yet. As written it said more than that: anyone holding a bet id could take a vacant role
-- on a bet that was not theirs and, by becoming a participant, gain read access to it.
--
-- Bet ids are UUIDv4 and are not guessable, so this was never a wide hole. It was still a
-- wider one than the rule it was meant to express, and "the id is secret" is not a policy.
--
-- Narrowed to exactly what `createBet` needs: the creator, adding themselves, to a bet they
-- created. Every other role is added by somebody already on the bet.
--
-- Accepting a shared bet is consequently not expressible yet, and that is on purpose. The
-- product's rule there is "possession of the link is the invitation", which is a capability
-- and deserves to be modelled as one — a policy keyed on the short code, or a narrow
-- SECURITY DEFINER join, in its own migration alongside the accept flow. Widening this
-- policy back out to cover it would trade a named capability for an unnamed one.
--
-- 0002 is applied and checksummed, so this arrives as a new file rather than an edit. That
-- is the rule the runner enforces and it is the right rule even on a database only one
-- machine has ever touched.

create function app_is_bet_creator(target_bet uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from bets b
    where b.id = target_bet
      and b.creator_id = (select app_current_user_id())
  )
$$;

revoke all on function app_is_bet_creator(uuid) from public;
grant execute on function app_is_bet_creator(uuid) to sporim_app;

drop policy participants_insert_on_my_bets on participants;

create policy participants_insert_on_my_bets on participants
  for insert to sporim_app
  with check (
    (
      role = 'creator'
      and user_id = (select app_current_user_id())
      and app_is_bet_creator(bet_id)
    )
    or app_is_participant(bet_id)
  );
