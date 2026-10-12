import { tokenConfig, vaultLive } from "@/lib/token"
import { blockTime, rewardMoves, tipBlock, type RewardMove } from "@/lib/vault-chain"

// The vault's book: every time the reward was put into the vault and every time the vault paid it
// out, each with its transaction. All of it is the reward's own transfers, read from the chain,
// so it is what anyone finds on an explorer; the vault page only lays it out.
//
// Nothing of it is stored. It is read once when first asked for and kept in memory; after that
// only the blocks that are new are read, and no more often than every few minutes: the public
// endpoint refuses a page that asks it on every visit.

// One line of the book. `wallet` is who put it in, or who was paid.
export type Move = { tx: `0x${string}`; block: number; at: number; wallet: `0x${string}`; amount: string }
export type Ledger = {
  // Newest first.
  put: Move[]
  paid: Move[]
  // The sums of both, in the reward's smallest units.
  putIn: string
  paidOut: string
  // The last block read, and when that was (in milliseconds).
  block: number
  readAt: number
}

// The part of the chain the book is read from. The tests play one.
export type Source = {
  tip(): Promise<bigint>
  moves(direction: "in" | "out", fromBlock: bigint, toBlock: bigint): Promise<RewardMove[]>
  timeOf(block: bigint): Promise<number>
}
const onChain: Source = { tip: tipBlock, moves: rewardMoves, timeOf: blockTime }

// How long a reading is good for.
export const LEDGER_FRESH_MS = 5 * 60 * 1000

type Kept = { key: string; next: bigint; put: Move[]; paid: Move[]; block: number; readAt: number }
let kept: Kept | null = null
let reading: Promise<Kept> | null = null

const sumOf = (moves: Move[]) => moves.reduce((sum, move) => sum + BigInt(move.amount), 0n).toString()
const newestFirst = (a: Move, b: Move) => b.block - a.block

async function read(key: string, first: bigint, before: Kept | null, now: number, source: Source): Promise<Kept> {
  const from = before ? before.next : first
  const tip = await source.tip()
  // No new block since the last reading: it stands, and counts as read just now.
  if (tip < from) return before ? { ...before, readAt: now } : { key, next: from, put: [], paid: [], block: Number(tip), readAt: now }

  const [into, outOf] = await Promise.all([source.moves("in", from, tip), source.moves("out", from, tip)])
  const times = new Map<bigint, number>()
  for (const move of [...into, ...outOf]) {
    if (!times.has(move.block)) times.set(move.block, await source.timeOf(move.block))
  }
  const shaped = (moves: RewardMove[]): Move[] =>
    [...moves]
      .sort((a, b) => (a.block === b.block ? b.index - a.index : a.block < b.block ? 1 : -1))
      .map((move) => ({
        tx: move.tx,
        block: Number(move.block),
        at: times.get(move.block) ?? 0,
        wallet: move.wallet.toLowerCase() as `0x${string}`,
        amount: move.value.toString(),
      }))
  return {
    key,
    next: tip + 1n,
    put: [...shaped(into), ...(before?.put ?? [])].sort(newestFirst),
    paid: [...shaped(outOf), ...(before?.paid ?? [])].sort(newestFirst),
    block: Number(tip),
    readAt: now,
  }
}

// The book as it stands, read again when the last reading is older than a few minutes. Throws
// when the vault is not switched on, or when there is no reading yet and the chain does not
// answer; with an older reading in hand, that one is given back.
export async function ledger(now = Date.now(), source: Source = onChain): Promise<Ledger> {
  const config = tokenConfig()
  if (!vaultLive(config)) throw new Error("The vault is not switched on.")
  const key = `${config.chainId}:${config.vault}:${config.reward.address}`.toLowerCase()
  if (kept && kept.key !== key) kept = null

  if (!kept || now - kept.readAt >= LEDGER_FRESH_MS) {
    // One reading at a time, however many visitors ask at once.
    reading ??= read(key, config.deployBlock, kept, now, source).finally(() => (reading = null))
    try {
      kept = await reading
    } catch (error) {
      if (!kept) throw error
    }
  }
  const { put, paid, block, readAt } = kept as Kept
  return { put, paid, putIn: sumOf(put), paidOut: sumOf(paid), block, readAt }
}

// Forgets the reading. For the tests.
export function forgetLedger() {
  kept = null
  reading = null
}
