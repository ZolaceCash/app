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
  "firstBlockAt" | "fundedIn" | "neverEarn" | "onTheTokensNetwork" | "rateChangesIn" | "takenBy" | "transfersIn" | "vaultBegan"
>

// The reward, closed by the owner: the last hour that earned, the owner's address that everything
// not claimed went to, and when, in seconds. `amount` is what nobody had earned by then and
// `earned` what holders had earned by then, both as text; what holders had taken of it is on the
// chain and on their lines of the list.
export type Closed = { hour: number; to: `0x${string}`; amount: string; earned: string; at: number }

// Where the count stands. Amounts are whole numbers too large for a plain number.
type State = {
  vault: string
  hour: number
  block: bigint
  balances: Map<string, bigint>
  earned: Map<string, bigint>
  funded: bigint
  rates: RateChange[]
  closed: Closed | null
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
    closed: row.closed ? (JSON.parse(row.closed) as Closed) : null,
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
    closed: null,
  }
}

// One hour, counted from the state the hour before left: who held how many lots through it, what
// the rate allowed, what the vault had been given, and so what each lot earned. Once the reward is
// closed an hour is still counted, so the balances stay right, and earns nothing. Null when the
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
  const each = state.closed ? 0n : shareOf(dueFor(rates, hour), lots, funded - sumOf(state.earned))

  const earned = new Map(state.earned)
  if (each > 0n) for (const [wallet, count] of held) earned.set(wallet, (earned.get(wallet) ?? 0n) + each * BigInt(count))

  const next: State = { vault: state.vault, hour, block: toBlock, balances: balancesAfter(state.balances, transfers), earned, funded, rates, closed: state.closed }
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
    closed: state.closed ? JSON.stringify(state.closed) : null,
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

// One piece of work on the count at a time in this process: two at once would both count the
// same hour, and a closing must not land in the middle of one.
const running = globalThis as unknown as { zolaceVaultCount?: Promise<Advance>; zolaceVaultTurn?: Promise<unknown> }

function inTurn<Result>(work: () => Promise<Result>): Promise<Result> {
  const turn = (running.zolaceVaultTurn ?? Promise.resolve()).then(work, work)
  running.zolaceVaultTurn = turn.catch(() => undefined)
  return turn
}

// Brings the count up to the last hour that is over, at most `most` hours in one go. Safe to call
// at any time and as often as one likes: an hour is never counted twice.
export function advance(now = Date.now(), most = 24, chain: Chain = onChain): Promise<Advance> {
  if (!running.zolaceVaultCount) {
    running.zolaceVaultCount = inTurn(() => bringUp(now, most, chain)).finally(() => {
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

export type Closing = { closed: Closed } | { refused: string }

const NOBODY = "0x0000000000000000000000000000000000000000"
const DEAD = "0x000000000000000000000000000000000000dead"

// Closes the reward, for good as far as this count goes: no hour after the last one counted
// earns, and everything in the vault that has not been claimed goes to the owner. That is what
// nobody had earned, and also what holders had earned and not taken: the site says of the vault
// that what sits in it is not a holder's until it is claimed, and this is where that is used.
//
// The vault's contract has no function that withdraws, so it is done on the list: each wallet's
// line is cut to what the chain says it has taken, and one line for the address the owner names
// holds all the rest. That line is claimed like any other. Nothing is sent here and no key is
// used; the list as it stands after this is signed when it is asked for, as every list is.
export function close(to: `0x${string}`, now = Date.now(), chain: Chain = onChain): Promise<Closing> {
  return inTurn(() => shut(to, now, chain))
}

async function shut(to: `0x${string}`, now: number, chain: Chain): Promise<Closing> {
  const config = tokenConfig()
  if (!vaultLive(config)) return { refused: "The vault is switched off." }
  const vault = config.vault.toLowerCase()
  const who = to.toLowerCase() as `0x${string}`
  if (who === NOBODY || who === DEAD || who === vault) return { refused: "That address could never claim what is left." }

  // Every hour that is over is counted first, so the record of what holders had earned is whole.
  const count = await bringUp(now, 24, chain)
  if (count.hour === null) return { refused: count.note ?? "The count has not started." }
  if (count.behind > 0) return { refused: `${count.behind} hour${count.behind === 1 ? " is" : "s are"} still to be counted. Count the hours first.` }

  const state = await stored(vault)
  if (!state) return { refused: "The count has not started." }
  if (state.closed) return { refused: "The reward is closed already." }

  const closed: Closed = {
    hour: state.hour,
    to: who,
    amount: (state.funded - sumOf(state.earned)).toString(),
    earned: (sumOf(state.earned) - (state.earned.get(who) ?? 0n)).toString(),
    at: Math.floor(now / 1000),
  }
  await keep({ ...state, earned: await settled(state, closed, chain), closed }, null, false)
  return { closed }
}

// The list of a closed reward: every wallet with what the chain says it has taken, and the
// owner's address with everything put into the vault less that.
async function settled(state: State, closed: Closed, chain: Chain) {
  const lines = new Map<string, bigint>()
  let taken = 0n
  for (const wallet of state.earned.keys()) {
    if (wallet === closed.to) continue
    const took = await chain.takenBy(wallet as `0x${string}`)
    // Kept even at nothing, where it is on no list: a wallet that claims later with a list it
    // had kept has to be asked about again.
    lines.set(wallet, took)
    taken += took
  }
  if (state.funded > taken) lines.set(closed.to, state.funded - taken)
  return lines
}

// Works the list of a closed reward out again from the chain. A list signed before the closing
// still passes the contract's check for as long as the signer is the same and the vault holds
// enough, so a wallet that kept one can claim with it after the closing. When one did, the
// owner's line is too large by that much and its claim would be refused; this puts it right.
export function settle(now = Date.now(), chain: Chain = onChain): Promise<Closing> {
  return inTurn(async () => {
    const config = tokenConfig()
    if (!vaultLive(config)) return { refused: "The vault is switched off." }

    // What was put in is read up to the last hour, so nothing sent to the vault lately is missed.
    const count = await bringUp(now, 24, chain)
    if (count.behind > 0) return { refused: `${count.behind} hour${count.behind === 1 ? " is" : "s are"} still to be counted. Count the hours first.` }

    const state = await stored(config.vault.toLowerCase())
    if (!state?.closed) return { refused: "The reward is not closed." }
    await keep({ ...state, earned: await settled(state, state.closed, chain) }, null, false)
    return { closed: state.closed }
  })
}


// Whether the reward is closed, for the pages that only have to say so.
export async function closure(): Promise<Closed | null> {
  const config = tokenConfig()
  if (!vaultLive(config)) return null
  const db = await getDb()
  const [row] = await db.select({ vault: vaultState.vault, closed: vaultState.closed }).from(vaultState).where(eq(vaultState.id, 1))
  return row && row.vault === config.vault.toLowerCase() && row.closed ? (JSON.parse(row.closed) as Closed) : null
}

export type Published = {
  // The hour the list runs to, and its root: what the signer signs.
  hour: number
  root: `0x${string}` | null
  // Everything the vault was given and everything earned by that hour, as text.
  funded: string
  total: string
  // Every wallet that has earned anything, with all it has earned since the vault began. Once the
  // reward is closed: every wallet with what it took, and the owner's address with all the rest.
  list: [string, string][]
  // Null while the reward runs.
  closed: Closed | null
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
    closed: state.closed,
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
