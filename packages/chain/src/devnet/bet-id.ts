/**
 * The database names a bet by a uuid; the program names it by 16 bytes (`bet_id: [u8; 16]`,
 * the PDA seed). They are the same 128 bits, and these two functions are the only place that
 * converts between them — the adapter and any reconciliation job both come through here, so a
 * byte-order mistake cannot exist in one and not the other.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function betIdToBytes(uuid: string): Uint8Array {
  if (!UUID.test(uuid)) throw new Error('not a uuid');
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function betIdFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('a bet id is 16 bytes');
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
