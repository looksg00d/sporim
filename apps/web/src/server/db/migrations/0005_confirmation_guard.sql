-- 0005_confirmation_guard.sql · only the holder of the invitation may fill in `confirmed_at`.
--
-- Found by the test written for 0004, which expected the creator's raw UPDATE against the
-- referee row to be refused and watched it succeed.
--
-- `participants_update_on_my_bets` (0002) lets anyone already on a bet update any participant
-- row on it, which is the right rule for the things that row is mostly for. It is the wrong
-- rule for one column: `confirmed_at` is the record of somebody *else's* consent, and a
-- creator who can write it can hand themselves a referee whose silence upholds their claim —
-- the exact abuse `disputedActions` was split to prevent. `createBet` refuses to do it and
-- `confirmReferee` is the only path that should, but "the repository does not do that" is not
-- a safeguard, it is a habit.
--
-- Row-level security cannot express this, because it is row-level: the row is legitimately
-- writable by that caller, and it is one column on it that is not. Column privileges cannot
-- express it either — they are granted to a role, not to a policy, so revoking `update
-- (confirmed_at)` from `sporim_app` would also close the one path that must stay open.
--
-- So the guard lives where the column does. A trigger sees the old row and the new one, runs
-- for every statement whichever policy let it through, and can ask the capability question
-- directly. This also subsumes 0004's permanence trigger — the two rules are about the same
-- column and reading them apart was the reason the gap was there to find.

drop trigger participants_confirmation_is_permanent on participants;
drop function participants_confirmation_is_permanent();

create function participants_confirmation_guard() returns trigger
language plpgsql
as $$
begin
  -- Already taken. The other side stakes money on "Anya has taken the role" being on the
  -- card; if the seat could be vacated or passed on, a dispute could be flipped from "the
  -- claim stands" to "everybody refunded" after the fact, by two people agreeing out of band.
  if old.confirmed_at is not null then
    if new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'a confirmation cannot be withdrawn or moved';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'a confirmed role cannot change hands';
    end if;
    return new;
  end if;

  -- Being taken. Consent belongs to the person consenting, so the only thing that may write
  -- it is a transaction carrying their invitation — checked server-side, against the stored
  -- token, by the same function the UPDATE policy uses.
  --
  -- The opponent's acceptance will want this column too, and will arrive with a capability of
  -- its own; when it does, this condition grows a second arm rather than losing this one.
  if new.confirmed_at is not null and not app_may_claim_referee(new.bet_id) then
    raise exception 'only the holder of the invitation can take a role';
  end if;

  return new;
end
$$;

create trigger participants_confirmation_guard before update on participants
  for each row execute function participants_confirmation_guard();
