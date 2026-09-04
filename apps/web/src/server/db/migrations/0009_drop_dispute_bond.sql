-- Disagreeing stops costing money.
--
-- `disputes.bond_amount` existed to stop the losing side from objecting to everything for
-- free: without a price, an objection is a free lottery ticket on the referee going quiet.
-- That is the right worry in an anonymous market, and it is why UMA and Reality.eth both have
-- a bond. It is the wrong worry here. Both parties and the referee are people who know each
-- other, an objection carries the objector's name, and being the friend who contests a bet
-- they plainly lost costs something no bond can price. We were charging for a deterrent we
-- already had, and making disagreement feel like filing a claim.
--
-- The rule it protected went with it. A confirmed referee's silence used to uphold the claim
-- (`settleUnrefereed`, now gone); it refunds, the same as an unconfirmed one's. The research
-- behind both halves is in `docs/DECISIONS.md` under 2026-09-04 — briefly: every model that
-- accepts silence as agreement does so only *before* anybody objects, and settling a known
-- disagreement on whether a third person opened a link decides by attendance, not by merit.
--
-- What we accept in exchange, written down so nobody has to rediscover it: a party who has
-- lost can object at no cost and, if the referee then vanishes, get their stake back. The
-- wager is that among friends this is embarrassing enough to be rare. If it is not, the
-- funnel will say so in numbers, and the answer will be a measured one.
--
-- Dropping the column rather than leaving it zero-filled: a money column nothing writes is an
-- invitation to somebody, one day, to read it. `disputes.resolution` stays and keeps its job —
-- the audit still has to tell "the referee said draw" apart from "the referee never came",
-- because only the first one is a decision.

alter table disputes drop constraint if exists disputes_bond_bounds;
alter table disputes drop column if exists bond_amount;

comment on column disputes.resolution is
  'Null until a referee rules. A refund on referee silence leaves it null on purpose: '
  'a draw is a decision, an absence is not.';
