import assert from "node:assert/strict"
import { test } from "node:test"

import { explorerTx } from "../lib/token"
import type { RewardMove } from "../lib/vault-chain"
import { forgetLedger, ledger, LEDGER_FRESH_MS, type Source } from "../lib/vault-ledger"

// The vault's book is read from the chain and kept in memory. A played chain stands in for the
// real one: it has a tip, movements at given blocks, and counts how often it is asked.

const TOKEN = "0x809737efd5ccc75352f2e9792045bb320dfdb266"
const VAULT = "0x7846a8e5cb8517254be8e7bb38c7d0f800609485"
const OWNER = "0x3ad938e5e8d868d616b19cce34dfeb1ce60daf21"
const HOLDER = "0xFB80a86501a45bb8499846748f42d5079a920798"
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`

function switchedOn() {
  process.env.TOKEN_ADDRESS = TOKEN
  process.env.VAULT_ADDRESS = VAULT
  process.env.TOKEN_CHAIN_ID = "4663"
  process.env.TOKEN_DEPLOY_BLOCK = "100"
  delete process.env.REWARD_ASSET
}

function played(tip: bigint, into: RewardMove[], outOf: RewardMove[]) {
  const chain = { tip, into, outOf, asked: [] as string[] }
  const source: Source = {
    tip: async () => chain.tip,
    moves: async (direction, from, to) => {
      chain.asked.push(`${direction} ${from}-${to}`)
      return (direction === "in" ? chain.into : chain.outOf).filter((move) => move.block >= from && move.block <= to)
    },
    timeOf: async (block) => 1_000_000 + Number(block),
  }
  return { chain, source }
}

test("the book has what went in and what was paid out, newest first, with sums", async () => {
  switchedOn()
  forgetLedger()
  const { chain, source } = played(
    500n,
    [
      { tx: tx(1), block: 200n, index: 0, wallet: OWNER, value: 400n },
      { tx: tx(3), block: 420n, index: 2, wallet: OWNER, value: 100n },
    ],
    [{ tx: tx(2), block: 300n, index: 1, wallet: HOLDER, value: 30n }]
  )
  const book = await ledger(1_000, source)
  assert.deepEqual(
    book.put.map((move) => [move.tx, move.block, move.at, move.amount]),
    [
      [tx(3), 420, 1_000_420, "100"],
      [tx(1), 200, 1_000_200, "400"],
    ]
  )
  assert.deepEqual(
    book.paid.map((move) => [move.wallet, move.amount]),
    [[HOLDER.toLowerCase(), "30"]]
  )
  assert.equal(book.putIn, "500")
  assert.equal(book.paidOut, "30")
  assert.equal(book.block, 500)
  // Read from the block the token was deployed in, to the tip.
  assert.deepEqual(chain.asked.sort(), ["in 100-500", "out 100-500"])
})

test("a reading is kept for a few minutes, and then only the new blocks are read", async () => {
  switchedOn()
  forgetLedger()
  const { chain, source } = played(500n, [{ tx: tx(1), block: 200n, index: 0, wallet: OWNER, value: 400n }], [])
  await ledger(1_000, source)
  chain.asked.length = 0

  // A claim lands, and somebody asks again at once: the reading in hand is given.
  chain.tip = 600n
  chain.outOf.push({ tx: tx(9), block: 560n, index: 0, wallet: HOLDER, value: 7n })
  const soon = await ledger(1_000 + LEDGER_FRESH_MS - 1, source)
  assert.equal(soon.paid.length, 0)
  assert.deepEqual(chain.asked, [])

  // Later it is read again, from the block after the last one read.
  const later = await ledger(1_000 + LEDGER_FRESH_MS, source)
  assert.deepEqual(chain.asked.sort(), ["in 501-600", "out 501-600"])
  assert.equal(later.put.length, 1)
  assert.deepEqual(
    later.paid.map((move) => move.tx),
    [tx(9)]
  )
  assert.equal(later.paidOut, "7")
  assert.equal(later.block, 600)
})

test("when the chain stops answering, the last reading is given; with none, it fails", async () => {
  switchedOn()
  forgetLedger()
  const silent: Source = {
    tip: async () => {
      throw new Error("no answer")
    },
    moves: async () => [],
    timeOf: async () => 0,
  }
  await assert.rejects(ledger(1_000, silent))

  const { source } = played(500n, [{ tx: tx(1), block: 200n, index: 0, wallet: OWNER, value: 400n }], [])
  await ledger(2_000, source)
  const kept = await ledger(2_000 + LEDGER_FRESH_MS, silent)
  assert.equal(kept.putIn, "400")
})

test("the book is not read while the vault is switched off", async () => {
  switchedOn()
  delete process.env.VAULT_ADDRESS
  forgetLedger()
  const { source } = played(500n, [], [])
  await assert.rejects(ledger(1_000, source), /not switched on/)
})

test("a transaction's link goes to the explorer of its network", () => {
  assert.equal(explorerTx(4663, tx(1)), `https://robinhoodchain.blockscout.com/tx/${tx(1)}`)
  assert.equal(explorerTx(1, tx(1)), null)
})
