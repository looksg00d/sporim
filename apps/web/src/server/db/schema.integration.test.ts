import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BENEFICIARY_KINDS,
  BET_ACTIONS,
  BET_FORMATS,
  BET_STATES,
  CHAIN_NETWORKS,
  DECISION_MODES,
  OUTCOMES,
  PARTY_SIDES,
  VIEWER_ROLES,
  usdc,
  type UserId,
} from '@sporim/domain';
import { fixtureBet, hasDatabase, ownerSql, uniquePrivyDid } from '@/testing/db';
import { PARTICIPANT_ROLES, toBetInsert } from './bet-row';
import { readMigrations } from './migrate';

/**
 * The schema against the domain it mirrors.
 *
 * The reason enums were chosen over repeated CHECK constraints (see `0001_init.sql`) is that
 * a named type can be compared to the `as const` array it came from. This suite is that
 * comparison: adding a state to `BET_STATES` without a migration fails here, which is the
 * only thing that keeps "mirrors the domain" from becoming a comment nobody re-reads.
 */

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('schema', () => {
  // Opened in `beforeAll`, not here: vitest still evaluates the body of a skipped suite, and
  // a connection built at that point would fail the file on a machine with no DATABASE_URL.
  let owner: ReturnType<typeof ownerSql>;
  const did = uniquePrivyDid('schema');
  let creatorId: UserId;

  beforeAll(async () => {
    owner = ownerSql();
    const [row] = await owner<{ id: string }[]>`
      insert into users (privy_did, display_name) values (${did}, 'schema fixture')
      returning id
    `;
    creatorId = row?.id as UserId;
  });

  afterAll(async () => {
    await owner`delete from users where privy_did = ${did}`;
    await owner.end();
  });

  async function labelsOf(typeName: string): Promise<string[]> {
    const rows = await owner<{ label: string }[]>`
      select e.enumlabel as label
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typname = ${typeName}
      order by e.enumsortorder
    `;
    return rows.map((row) => row.label);
  }

  it.each([
    ['bet_format', BET_FORMATS],
    ['bet_state', BET_STATES],
    ['decision_mode', DECISION_MODES],
    ['bet_outcome', OUTCOMES],
    ['party_side', PARTY_SIDES],
    ['beneficiary_kind', BENEFICIARY_KINDS],
    ['chain_network', CHAIN_NETWORKS],
    ['bet_action', BET_ACTIONS],
    ['participant_role', PARTICIPANT_ROLES],
  ])('%s carries exactly the domain values, in order', async (typeName, domainValues) => {
    expect(await labelsOf(typeName)).toEqual([...domainValues]);
  });

  it('treats an observer as the absence of a participant, not as a role', () => {
    expect([...PARTICIPANT_ROLES, 'observer'].sort()).toEqual([...VIEWER_ROLES].sort());
  });

  it('enables and forces row-level security on every application table', async () => {
    const rows = await owner<{ relname: string; enabled: boolean; forced: boolean }[]>`
      select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '\\_%'
      order by c.relname
    `;
    expect(rows.map((row) => row.relname)).toEqual([
      'bet_events',
      'bets',
      'claims',
      'disputes',
      'participants',
      'referee_invites',
      'users',
      'waitlist',
    ]);
    // FORCE is what stops a table owner without BYPASSRLS from walking past its own policies.
    expect(rows.every((row) => row.enabled && row.forced)).toBe(true);
  });

  it('never grants the application role permission to delete', async () => {
    const rows = await owner`
      select table_name from information_schema.role_table_grants
      where grantee = 'sporim_app' and privilege_type = 'DELETE'
    `;
    expect(rows).toHaveLength(0);
  });

  it('never grants the application role permission to re-point a referee invitation', async () => {
    // A capability that can be silently moved to another bet, or reissued under the same
    // link, is not a capability. Write once, read as the creator, resolve as the owner.
    const rows = await owner<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where grantee = 'sporim_app' and table_name = 'referee_invites'
      order by privilege_type
    `;
    expect(rows.map((row) => row.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });

  it('refuses a referee token that is not 32 base58 characters', async () => {
    const bet = toBetInsert(fixtureBet({ creatorId }), creatorId);
    await expect(
      owner.begin(async (tx) => {
        await tx`insert into bets ${tx(bet)}`;
        // A short code is 8 characters. If it could be stored here the two capabilities would
        // no longer be structurally distinguishable, which is half of what keeps them apart.
        await tx`insert into referee_invites (bet_id, token) values (${bet.id}, ${bet.short_code})`;
      }),
    ).rejects.toThrow(/referee_invites_token_shape/);
  });

  it('refuses a confirmation with no account behind it', async () => {
    const bet = toBetInsert(fixtureBet({ creatorId }), creatorId);
    await expect(
      owner.begin(async (tx) => {
        await tx`insert into bets ${tx(bet)}`;
        await tx`
          insert into participants (bet_id, role, display_name, confirmed_at)
          values (${bet.id}, 'referee', 'anya', now())
        `;
      }),
    ).rejects.toThrow(/participants_confirmed_needs_user/);
  });

  /** Runs the statement and expects Postgres to refuse it; the failure rolls the fixture back. */
  async function expectRefused(values: Record<string, unknown>, pattern: RegExp): Promise<void> {
    const base = toBetInsert(fixtureBet({ creatorId }), creatorId);
    await expect(
      owner.begin((tx) => tx`insert into bets ${tx({ ...base, ...values })}`),
    ).rejects.toThrow(pattern);
  }

  it('refuses a stake below the phase-0 minimum', async () => {
    await expectRefused(
      { stake_creator: 999_999n, stake_opponent: 999_999n },
      /bets_stake_creator_bounds/,
    );
  });

  it('refuses a stake above the phase-0 cap', async () => {
    await expectRefused(
      { stake_creator: usdc(101), stake_opponent: usdc(101) },
      /bets_stake_creator_bounds/,
    );
  });

  it('refuses asymmetric stakes on a Bet — that is odds, not a bet between friends', async () => {
    await expectRefused({ stake_opponent: usdc(10) }, /bets_stakes_match_format/);
  });

  it('refuses a one-sided format that leaves the decision to mutual confirmation', async () => {
    await expectRefused(
      { format: 'commit', stake_opponent: 0n, decision_mode: 'mutual' },
      /bets_one_sided_needs_referee/,
    );
  });

  it('refuses a fee above the community ceiling', async () => {
    await expectRefused({ fee_bps: 1_001 }, /bets_fee_bps_bounds/);
  });

  it('refuses an outcome on a bet that has not resolved', async () => {
    await expectRefused({ outcome: 'creator_wins' }, /bets_outcome_only_when_resolved/);
  });

  it('has applied every migration on disk, and only those', async () => {
    const onDisk = readMigrations().map((migration) => ({
      id: migration.id,
      checksum: migration.checksum,
    }));
    const applied = await owner<{ id: string; checksum: string }[]>`
      select id, checksum from _sporim_migrations order by id
    `;
    expect(applied.map((row) => ({ id: row.id, checksum: row.checksum }))).toEqual(onDisk);
  });
});
