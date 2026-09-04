-- `settleUnrefereed` leaves the vocabulary.
--
-- The action existed for one situation: a *confirmed* referee went silent after a dispute, and
-- the claim was upheld rather than refunded. That rule is gone (0009), so the action names a
-- transition the state machine can no longer produce — and the whole point of `bet_action`
-- being an enum rather than text is that the audit trail cannot record a move that could not
-- have happened.
--
-- Postgres has no `DROP VALUE`, so the type is rebuilt. `bet_events.action` is the only column
-- that uses it, plus the index over it; both are carried across by the `USING` cast.
--
-- The guard below is not ceremony. If a row ever did record `settleUnrefereed`, somebody was
-- paid under the old rule, and quietly recasting that row would rewrite what happened to their
-- money. There are no such rows today — checked before writing this — so the migration should
-- pass silently; if it ever does not, the right response is a product decision about those
-- bets, not a wider cast.

do $$
declare stranded bigint;
begin
  select count(*) into stranded from bet_events where action = 'settleUnrefereed';
  if stranded > 0 then
    raise exception
      'cannot drop settleUnrefereed: % bet_events row(s) record it. Those bets were settled '
      'under the pre-2026-09-04 rule and need a decision, not a cast.', stranded;
  end if;
end $$;

alter type bet_action rename to bet_action_pre_0010;

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
  'refundExpired'
);

alter table bet_events
  alter column action type bet_action using action::text::bet_action;

drop type bet_action_pre_0010;

comment on type bet_action is
  'Every move anyone can make on a bet — BET_ACTIONS verbatim, in order. '
  'Asserted against the domain by schema.integration.test.ts.';
