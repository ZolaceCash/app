import { desc } from "drizzle-orm"

import { getDb, schema } from "@/lib/db"
import { MINIMUM_UNITS } from "@/lib/token"
import { lowestBalances, monthBounds, periodId, rootOf, splitReward, type Line } from "@/lib/vault"
import { allTransfers, blocksBetween, contractsAmong, fundedMonth, ownWallets } from "@/lib/vault-chain"

const { vaultMonths } = schema

// The vault's own records: the list of each month the owner funded. Nothing here sends anything.
// The owner funds a month from the owner's own wallet, and a holder claims from theirs.

export type Sheet = {
  period: string
  id: number
  fromBlock: bigint
  toBlock: bigint
  // How many wallets ever held the token, and how many reached the minimum before any were left out.
  holders: number
  lines: (Line & { contract: boolean })[]
  // What the lines add up to: this is what the owner puts in.
  total: bigint
  left: bigint
  root: `0x${string}` | null
  // Wallets left out: the token's own, and whatever the owner named.
  skipped: string[]
}

// The owner's list for one month: every wallet that held the minimum throughout, and its part of
// a reward the owner names. Worked out from the token's transfers alone, so anyone who has the
// month, the amount and the wallets left out can work out the same list and the same root.
export async function monthSheet(period: string, pool: bigint, skip: string[], now = Date.now()): Promise<Sheet> {
  const bounds = monthBounds(period)
  if (!bounds) throw new Error("A month is written like 2026-10.")
  if (bounds.end * 1000 >= now) throw new Error("That month is not over yet.")

  const { fromBlock, toBlock } = await blocksBetween(bounds.start, bounds.end)
  const lowest = lowestBalances(await allTransfers(toBlock), fromBlock, toBlock)
  const skipped = [...new Set([...(await ownWallets()), ...skip.map((wallet) => wallet.toLowerCase())])]
  const { lines, left } = splitReward(pool, lowest, MINIMUM_UNITS, skipped)
  const contracts = await contractsAmong(lines.map((line) => line.wallet))
  const id = periodId(period)

  return {
    period,
    id,
    fromBlock,
    toBlock,
    holders: lowest.size,
    lines: lines.map((line) => ({ ...line, contract: contracts.has(line.wallet) })),
    total: lines.reduce((sum, line) => sum + line.amount, 0n),
    left,
    root: rootOf(id, lines),
    skipped,
  }
}

export type Answer = { ok: true } | { ok: false; error: string }

// The owner funded the month on the chain and records its list here, so the vault page can show
// it and holders can claim. It is only recorded if the vault's contract holds this very root and
// this very total for the month: what the site lists is then what the contract will pay.
export async function recordMonth(sheet: Sheet, now = Date.now()): Promise<Answer> {
  if (!sheet.root || sheet.lines.length === 0) return { ok: false, error: "Nobody is on that month's list." }

  const onChain = await fundedMonth(sheet.id)
  if (!onChain.funded) return { ok: false, error: "The vault's contract has not been funded for that month yet." }
  if (onChain.root.toLowerCase() !== sheet.root.toLowerCase() || onChain.total !== sheet.total) {
    return {
      ok: false,
      error: "The vault's contract was funded with another list or another amount. Enter the amount and the wallets left out as they were when it was funded.",
    }
  }

  const db = await getDb()
  const made = await db
    .insert(vaultMonths)
    .values({
      period: sheet.period,
      fromBlock: Number(sheet.fromBlock),
      toBlock: Number(sheet.toBlock),
      root: sheet.root,
      total: sheet.total.toString(),
      wallets: sheet.lines.length,
      list: JSON.stringify(sheet.lines.map((line) => [line.wallet, line.amount.toString()])),
      recordedAt: now,
    })
    .onConflictDoNothing({ target: vaultMonths.period })
    .returning({ period: vaultMonths.period })
  return made.length > 0 ? { ok: true } : { ok: false, error: "That month is already recorded." }
}

export type FundedMonth = {
  period: string
  id: number
  fromBlock: number
  toBlock: number
  root: string
  // Amounts are whole numbers too large for a plain number, so they travel as text.
  total: string
  wallets: number
  list: [string, string][]
}

// The months that were funded, newest first, each with its whole list. All of it is public: the
// list is what the root on the chain stands for, and every claim shows its wallet and amount.
export async function listMonths(): Promise<FundedMonth[]> {
  const db = await getDb()
  const rows = await db.select().from(vaultMonths).orderBy(desc(vaultMonths.period))
  return rows.map((row) => ({
    period: row.period,
    id: periodId(row.period),
    fromBlock: row.fromBlock,
    toBlock: row.toBlock,
    root: row.root,
    total: row.total,
    wallets: row.wallets,
    list: JSON.parse(row.list) as [string, string][],
  }))
}
