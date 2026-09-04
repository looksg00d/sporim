-- The creator could not read back the bet they had just written.
--
-- `bets_select_participant` answers "may you see this bet?" with `app_is_participant(id)`,
-- and the creator's `participants` row is inserted by the *next* statement — the order is
-- forced by `participants_insert_on_my_bets`, which judges "already on this bet" against the
-- snapshot its own statement started with. So for the width of one statement the author of a
-- bet is not yet on it.
--
-- That gap is invisible until something reads the row in the same breath as writing it, and
-- `createBet` does exactly that: `insert … returning id`. Postgres applies the SELECT policy
-- to a RETURNING row, so the insert itself was refused — reported, confusingly, as a *write*
-- violation on `bets`.
--
-- Fixing it by dropping RETURNING would be treating the symptom, and would cost the one
-- round trip that tells a retry (`on conflict do nothing`) apart from a fresh write. The
-- honest statement is the one missing from the schema: **you can always see a bet you
-- created.** It grants nothing new — the creator is a participant a statement later — it
-- just stops depending on the order two inserts happen to run in.
create policy bets_select_own on bets
  for select
  using (creator_id = (select app_current_user_id()));
