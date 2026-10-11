import { desc, eq } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import { MINIMUM_UNITS, tokenConfig, vaultLive } from "@/lib/token"
import { balancesAfter, dueFor, hourEnd, hourOf, hourStart, linesOf, lotsThrough, rootOf, shareOf, type RateChange } from "@/lib/vault"
import * as onChain from "@/lib/vault-chain"

const { vaultHours, vaultState } = schema

// The vault's own records: the count, hour by hour, of who held how many lots and what each
// hour paid, and the list that follows from it. Nothing here sends anything and nothing here holds a
// key. The owner funds the vault from the owner's own wallet, and a holder claims from theirs.

// What the count asks of the chain. Passed in, so the count can be tried against a chain made up
// for a test.
export type Chain = Pick<
  typeof onChain,
  "firstBlockAt" | "fundedIn" | "neverEarn" | "onTheTokensNetwork" | "rateChangesIn" | "transfersIn" | "vaultBegan"
>

// Where the count stands. Amounts are whole numbers too large for a plain number.
type State = {
  vault: string
  hour: number
  block: bigint
  balances: Map<string, bigint>
  earned: Map<string, bigint>
  funded: bigint
  rates: RateChange[]
}

const pack = (amounts: Map<string, bigint>) => JSON.stringify([...amounts].map(([wallet, amount]) => [wallet, amount.toString()]))
const unpack = (text: string) => new Map((JSON.parse(text) as [string, string][]).map(([wallet, amount]) => [wallet, BigInt(amount)]))
const sumOf = (amounts: Map<string, bigint>) => [...amounts.values()].reduce((sum, amount) => sum + amount, 0n)

async function stored(vault: string): Promise<State | null> {
  const db = await getDb()
  const [row] = await db.select().from(vaultState).where(eq(vaultState.id, 1))
  // A count kept for another vault is of no use to this one.
  if (!row || row.vault !== vault) return null
  return {
    vault: row.vault,
    hour: row.hour,
    block: BigInt(row.block),
    balances: unpack(row.balances),
    earned: unpack(row.earned),
    funded: BigInt(row.funded),
    rates: (JSON.parse(row.rates) as [number, string, string][]).map(([at, rate, ceiling]) => ({ at, rate: BigInt(rate), ceiling: BigInt(ceiling) })),
  }
}

// Where a count starts: at the hour the vault's contract was made in, with every wallet's balance
// as it stood going into that hour. Null while the contract is not there.
async function fresh(vault: string, chain: Chain): Promise<State | null> {
  const config = tokenConfig()
  const began = await chain.vaultBegan()
  if (!began) return null
  const first = hourOf(began.at)
  const opens = await chain.firstBlockAt(hourStart(first), config.deployBlock)
  if (opens === null) return null
  return {
    vault,
    hour: first - 1,
    block: opens - 1n,
    balances: balancesAfter(new Map(), await chain.transfersIn(config.deployBlock, opens - 1n)),
    earned: new Map(),
    funded: 0n,
    rates: [],
  }
}

// One hour, counted from the state the hour before left: who held how many lots through it, what
// the rate allowed, what the vault had been given, and so what each lot earned. Null when the
// chain has not reached the end of the hour.
async function count(state: State, skip: string[], now: number, chain: Chain) {
  const hour = state.hour + 1
  const after = await chain.firstBlockAt(hourEnd(hour), state.block + 1n)
  if (after === null) return null
  const fromBlock = state.block + 1n
  const toBlock = after - 1n

  const transfers = await chain.transfersIn(fromBlock, toBlock)
  const held = lotsThrough(state.balances, transfers, MINIMUM_UNITS, skip)
  const lots = held.reduce((sum, [, count]) => sum + count, 0)
  const funded = state.funded + (await chain.fundedIn(fromBlock, toBlock))
  const rates = [...state.rates, ...(await chain.rateChangesIn(fromBlock, toBlock))]
  const each = shareOf(dueFor(rates, hour), lots, funded - sumOf(state.earned))

  const earned = new Map(state.earned)
  if (each > 0n) for (const [wallet, count] of held) earned.set(wallet, (earned.get(wallet) ?? 0n) + each * BigInt(count))

  const next: State = { vault: state.vault, hour, block: toBlock, balances: balancesAfter(state.balances, transfers), earned, funded, rates }
  const row = {
    hour,
    fromBlock: Number(fromBlock),
    toBlock: Number(toBlock),
    wallets: JSON.stringify(held),
    each: each.toString(),
    funded: funded.toString(),
    total: sumOf(earned).toString(),
    root: rootOf(linesOf(earned)),
    countedAt: now,
  }
  return { next, row }
}

async function keep(state: State, row: typeof vaultHours.$inferInsert | null, startOver: boolean) {
  const db = await getDb()
  const values = {
    id: 1,
    vault: state.vault,
    hour: state.hour,
    block: Number(state.block),
    balances: pack(state.balances),
    earned: pack(state.earned),
    funded: state.funded.toString(),
    rates: JSON.stringify(state.rates.map((change) => [change.at, change.rate.toString(), change.ceiling.toString()])),
  }
  // The hour and the state it leaves are written together or not at all: an hour counted twice
  // would pay twice.
  await db.transaction(async (tx) => {
    if (startOver) await tx.delete(vaultHours)
    if (row) await tx.insert(vaultHours).values(row)
    await tx.insert(vaultState).values(values).onConflictDoUpdate({ target: vaultState.id, set: values })
  })
}

// An hour is counted once it has been over for this long, so its last blocks have settled.
const SETTLE = 90

// How many full hours are over and not counted yet.
export const hoursBehind = (hour: number, now = Date.now()) => Math.max(0, hourOf(Math.floor(now / 1000) - SETTLE) - 1 - hour)

export type Advance = { counted: number; hour: number | null; behind: number; note?: string }

// One count at a time in this process: two at once would both count the same hour.
const running = globalThis as unknown as { zolaceVaultCount?: Promise<Advance> }

// Brings the count up to the last hour that is over, at most `most` hours in one go. Safe to call
// at any time and as often as one likes: an hour is never counted twice.
export function advance(now = Date.now(), most = 24, chain: Chain = onChain): Promise<Advance> {
  if (!running.zolaceVaultCount) {
    running.zolaceVaultCount = bringUp(now, most, chain).finally(() => {
      running.zolaceVaultCount = undefined
    })
  }
  return running.zolaceVaultCount
}

async function bringUp(now: number, most: number, chain: Chain): Promise<Advance> {
  const config = tokenConfig()
  if (!vaultLive(config)) return { counted: 0, hour: null, behind: 0, note: "The vault is switched off." }
  await chain.onTheTokensNetwork()

  const vault = config.vault.toLowerCase()
  let state = await stored(vault)
  if (!state) {
    state = await fresh(vault, chain)
    if (!state) return { counted: 0, hour: null, behind: 0, note: "There is no vault contract at VAULT_ADDRESS yet." }
    await keep(state, null, true)
  }

  const last = hourOf(Math.floor(now / 1000) - SETTLE) - 1
  const skip = await chain.neverEarn()
  let counted = 0
  while (state.hour < last && counted < most) {
    const made = await count(state, skip, now, chain)
    if (!made) break
    await keep(made.next, made.row, false)
    state = made.next
    counted++
  }
  return { counted, hour: state.hour, behind: Math.max(0, last - state.hour) }
}

export type Published = {
  // The hour the list runs to, and its root: what the signer signs.
  hour: number
  root: `0x${string}` | null
  // Everything the vault was given and everything earned by that hour, as text.
  funded: string
  total: string
  // Every wallet that has earned anything, with all it has earned since the vault began.
  list: [string, string][]
}

// The list as it stands: the same for everyone, and all of it public.
export async function published(): Promise<Published | null> {
  const config = tokenConfig()
  if (!vaultLive(config)) return null
  const state = await stored(config.vault.toLowerCase())
  if (!state) return null
  const lines = linesOf(state.earned)
  return {
    hour: state.hour,
    root: rootOf(lines),
    funded: state.funded.toString(),
    total: sumOf(state.earned).toString(),
    list: lines.map((line) => [line.wallet, line.amount.toString()]),
  }
}

// `wallets` is each wallet that earned the hour with the lots it held; `each` is what one lot earned.
export type CountedHour = { hour: number; fromBlock: number; toBlock: number; wallets: [string, number][]; lots: number; each: string; root: string | null }

// The last hours counted, newest first.
export async function recentHours(most = 24): Promise<CountedHour[]> {
  const db = await getDb()
  const rows = await db.select().from(vaultHours).orderBy(desc(vaultHours.hour)).limit(most)
  return rows.map((row) => {
    const wallets = JSON.parse(row.wallets) as [string, number][]
    return {
      hour: row.hour,
      fromBlock: row.fromBlock,
      toBlock: row.toBlock,
      wallets,
      lots: wallets.reduce((sum, [, count]) => sum + count, 0),
      each: row.each,
      root: row.root,
    }
  })
}
