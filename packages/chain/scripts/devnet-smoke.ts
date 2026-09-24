/**
 * One real round trip against the deployed program on devnet, through the generated client.
 *
 *   pnpm --filter @sporim/chain exec tsx scripts/devnet-smoke.ts <path-to-admin-keypair.json>
 *
 * The admin keypair pays every fee and all rent (plan decision D2). The creator is a fresh
 * keypair holding test tokens and **zero SOL** — if the program still charged the creator
 * anything, this fails. The story is create → cancel, the one path that needs no waiting (a
 * deadline is at least 15 minutes out), and it checks that cancelling closes both accounts.
 *
 * The first run creates the devnet test mint (decision D3) and records it in
 * `devnet.json`; later runs reuse it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  fetchEncodedAccount,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
} from '@solana-program/token';
import { betIdToBytes } from '../src/devnet/bet-id';
import {
  SPORIM_PROGRAM_ADDRESS,
  findBetPda,
  getCancelBetInstructionAsync,
  getCreateBetInstructionAsync,
} from '../src/devnet/generated';

const RPC_URL = 'https://api.devnet.solana.com';
const WS_URL = 'wss://api.devnet.solana.com';
const TREASURY = 'HsN55AF4EzoAMFbDpvZfz2twVEUMacLw7GwHxaYG8Jvv' as Address;
const STATE_FILE = fileURLToPath(new URL('../devnet.json', import.meta.url));
const USDC = 1_000_000n;

const rpc = createSolanaRpc(RPC_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
});

async function send(payer: KeyPairSigner, instructions: readonly Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: 'confirmed' });
  return getSignatureFromTransaction(signed);
}

async function lamports(address: Address): Promise<bigint> {
  return (await rpc.getBalance(address).send()).value;
}

async function ensureMint(admin: KeyPairSigner): Promise<Address> {
  if (existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { mint: Address };
    return state.mint;
  }
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(admin, [
    getCreateAccountInstruction({
      payer: admin,
      newAccount: mint,
      lamports: rent,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: 6,
      mintAuthority: admin.address,
    }),
  ]);
  const state = {
    network: 'devnet',
    programId: SPORIM_PROGRAM_ADDRESS,
    mint: mint.address,
    mintDecimals: 6,
    mintAuthority: admin.address,
    treasury: TREASURY,
    note: 'Test mint for devnet (plan decision D3). Not USDC; worthless by design.',
  };
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  console.log('created test mint', mint.address);
  return mint.address;
}

async function main(): Promise<void> {
  const keypairPath = process.argv[2];
  if (!keypairPath) throw new Error('usage: devnet-smoke.ts <admin-keypair.json>');
  const admin = await createKeyPairSignerFromBytes(
    new Uint8Array(JSON.parse(readFileSync(keypairPath, 'utf8')) as number[]),
  );
  const mint = await ensureMint(admin);

  const creator = await generateKeyPairSigner();
  const [creatorAta] = await findAssociatedTokenPda({
    owner: creator.address,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  await send(admin, [
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: admin,
      owner: creator.address,
      mint,
    }),
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: admin,
      owner: TREASURY,
      mint,
    }),
    getMintToInstruction({ mint, token: creatorAta, mintAuthority: admin, amount: 50n * USDC }),
  ]);

  const betId = betIdToBytes(crypto.randomUUID());
  const [bet] = await findBetPda({ betId });
  const now = BigInt(Math.floor(Date.now() / 1000));

  const adminBefore = await lamports(admin.address);
  const createSig = await send(admin, [
    await getCreateBetInstructionAsync({
      creator,
      payer: admin,
      mint,
      betId,
      stake: 5n * USDC,
      deadline: now + 3600n,
      acceptDeadline: now + 1800n,
    }),
  ]);
  console.log('create_bet', createSig);
  if ((await lamports(creator.address)) !== 0n) throw new Error('the creator paid SOL');
  const [vault] = await findAssociatedTokenPda({
    owner: bet,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const rent = (await lamports(bet)) + (await lamports(vault));

  const cancelSig = await send(admin, [
    await getCancelBetInstructionAsync({ creator, bet, mint, rentPayer: admin.address }),
  ]);
  console.log('cancel_bet', cancelSig);

  const betAfter = await fetchEncodedAccount(rpc, bet);
  const vaultAfter = await fetchEncodedAccount(rpc, vault);
  if (betAfter.exists || vaultAfter.exists) throw new Error('cancel left an account open');
  const adminAfter = await lamports(admin.address);

  console.log(
    JSON.stringify(
      {
        ok: true,
        bet,
        rentHeldWhileOpen: rent.toString(),
        adminNetCostLamports: (adminBefore - adminAfter).toString(),
        creatorSol: '0',
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
