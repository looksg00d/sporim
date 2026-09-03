-- The confirmation guard only fired BEFORE UPDATE, so the whole rule could be walked around
-- by writing the row confirmed in the first place.
--
-- The INSERT policy on `participants` ends in `OR app_is_participant(bet_id)`, so the creator
-- — a participant the moment they add themselves — could insert a `referee` row with
-- `confirmed_at` already set and any `user_id` they liked. A referee confirmed that way is one
-- nobody ever asked, and their silence then *upholds the creator's own claim* instead of
-- refunding. Verified by probe before this migration: the insert succeeded.
--
-- Same rule, both doors: consent may only be written by a transaction carrying the invitation.

create or replace function participants_confirmation_guard() returns trigger
language plpgsql as $$
begin
  -- Already taken. The other side stakes money on "Anya has taken the role" being on the
  -- card; if the seat could be vacated or passed on, a dispute could be flipped from "the
  -- claim stands" to "everybody refunded" after the fact, by two people agreeing out of band.
  -- OLD is only bound on UPDATE, so this arm has to be guarded by TG_OP.
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
  -- consenting, so the only thing that may write it is a transaction carrying their
  -- invitation, checked server-side against the stored token.
  --
  -- The opponent's acceptance will want this column too, and will arrive with a capability of
  -- its own; when it does, this condition grows a second arm rather than losing this one.
  if new.confirmed_at is not null and not app_may_claim_referee(new.bet_id) then
    raise exception 'only the holder of the invitation can take a role';
  end if;

  return new;
end;
$$;

drop trigger if exists participants_confirmation_guard on participants;

create trigger participants_confirmation_guard
  before insert or update on participants
  for each row execute function participants_confirmation_guard();
