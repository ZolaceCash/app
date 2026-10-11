import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import { hashTypedData } from "viem"

// A database of its own, set before anything opens one.
process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(tmpdir(), "zolace-vault-")), "test.db")}`

import {
  DEFAULT_REWARD_ASSET,
  formatTokens,
  formatUnitsShort,
  HOURLY_CENTS,
  MINIMUM_UNITS,
  parseAsset,
  parseUnitsExact,
  explorerUrl,
  tokenConfig,
  tokenStatement,
  vaultLive,
} from "../lib/token"
import {
  balancesAfter,
  ceilingAt,
  dueFor,
  hourEnd,
  hourLabel,
  hourOf,
  hourStart,
  leafOf,
  linesOf,
  listToSign,
  lotsThrough,
  onTheList,
  parseWallets,
  proofOf,
  rateFor,
  rootOf,
  shareOf,
  type RateChange,
  type Transfer,
} from "../lib/vault"
import { signerAddress, signList } from "../lib/vault-sign"
import type { Chain } from "../lib/vault-store"

const ZERO = "0x0000000000000000000000000000000000000000"
const wallet = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`
const A = wallet(0xa1)
const B = wallet(0xb2)
const C = wallet(0xc3)
const D = wallet(0xd4)
const tokens = (n: number) => BigInt(n) * 10n ** 18n

let index = 0
const move = (from: string, to: string, amount: bigint, block: number): Transfer => ({
  from,
  to,
  value: amount,
  block: BigInt(block),
  index: index++,
})

// ---------------------------------------------------------------- the settings

const SETTINGS = ["TOKEN_ADDRESS", "TOKEN_CHAIN_ID", "TOKEN_RPC_URL", "TOKEN_DEPLOY_BLOCK", "VAULT_ADDRESS", "VAULT_SKIP", "VAULT_SIGNER_KEY", "REWARD_ASSET", "REWARD_SYMBOL", "REWARD_DECIMALS"]

async function withEnv<Result>(values: Record<string, string | undefined>, run: () => Result | Promise<Result>) {
  const before = Object.fromEntries(SETTINGS.map((name) => [name, process.env[name]]))
  for (const name of SETTINGS) delete process.env[name]
  for (const [name, value] of Object.entries(values)) if (value !== undefined) process.env[name] = value
  try {
    return await run()
  } finally {
    for (const name of SETTINGS) {
      if (before[name] === undefined) delete process.env[name]
      else process.env[name] = before[name]
    }
  }
}

test("with nothing set there is no token, and the reward is NVDA on Robinhood Chain", async () => {
  await withEnv({}, () => {
    const config = tokenConfig()
    assert.equal(config.address, null)
    assert.equal(config.vault, null)
    assert.equal(config.chainId, 4663)
    assert.deepEqual(config.skip, [])
    assert.deepEqual(config.reward, {
      address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
      symbol: "NVDA",
      decimals: 18,
    })
    assert.equal(vaultLive(config), false)
  })
})

test("the vault is open once the token and the vault have an address", async () => {
  await withEnv({ TOKEN_ADDRESS: A, VAULT_ADDRESS: B, TOKEN_DEPLOY_BLOCK: "120" }, () => {
    const config = tokenConfig()
    assert.equal(vaultLive(config), true)
    assert.equal(config.deployBlock, 120n)
  })
  await withEnv({ TOKEN_ADDRESS: A }, () => assert.equal(vaultLive(tokenConfig()), false))
  await withEnv({ TOKEN_ADDRESS: "not an address", VAULT_ADDRESS: B }, () => assert.equal(vaultLive(tokenConfig()), false))
})

test("a reward on another network than the token switches the vault off", async () => {
  // The token on the test network, the reward left at its default on mainnet.
  await withEnv({ TOKEN_ADDRESS: A, VAULT_ADDRESS: B, TOKEN_CHAIN_ID: "46630" }, () => {
    const config = tokenConfig()
    assert.equal(config.reward, null)
    assert.equal(vaultLive(config), false)
  })
  await withEnv(
    { TOKEN_ADDRESS: A, VAULT_ADDRESS: B, TOKEN_CHAIN_ID: "46630", REWARD_ASSET: `eip155:46630/erc20:${C}`, REWARD_SYMBOL: "TEST", REWARD_DECIMALS: "6" },
    () => {
      const config = tokenConfig()
      assert.deepEqual(config.reward, { address: C, symbol: "TEST", decimals: 6 })
      assert.equal(vaultLive(config), true)
    }
  )
})

test("addresses that never earn are read from the setting, and what is not an address is dropped", async () => {
  await withEnv({ VAULT_SKIP: `${A.toUpperCase().replace("0X", "0x")}, ${B}\n0x1234 nonsense` }, () => {
    assert.deepEqual(tokenConfig().skip, [A, B])
  })
})

test("what the site says about the token follows the address it is given", async () => {
  await withEnv({}, () => {
    const said = tokenStatement(tokenConfig())
    assert.match(said, /There is no token today and no contract address/)
    assert.match(said, /not from this project/)
  })
  await withEnv({ TOKEN_ADDRESS: A }, () => {
    const said = tokenStatement(tokenConfig())
    assert.doesNotMatch(said, /There is no token/)
    assert.match(said, /on Robinhood Chain, at the address below/)
    // Having an address must not make the site claim a check that was not done.
    assert.match(said, /has not been audited and no legal review has been done/)
    assert.match(said, /reward for its holders is not open/)
    assert.match(said, /Nothing here is an offer/)
  })
  await withEnv({ TOKEN_ADDRESS: A, VAULT_ADDRESS: B }, () => assert.match(tokenStatement(tokenConfig()), /vault that pays its holders is open/))
  await withEnv({ TOKEN_ADDRESS: A, TOKEN_CHAIN_ID: "46630" }, () => assert.match(tokenStatement(tokenConfig()), /on Robinhood Chain testnet/))
  // An address that is not one is no address: the site keeps saying there is no token.
  await withEnv({ TOKEN_ADDRESS: "0x1234" }, () => assert.match(tokenStatement(tokenConfig()), /There is no token today/))
  await withEnv({ TOKEN_ADDRESS: `  ${A}  ` }, () => assert.equal(tokenConfig().address, A))

  assert.equal(explorerUrl(4663, A), `https://robinhoodchain.blockscout.com/address/${A}`)
  assert.equal(explorerUrl(1, A), null)
})

test("an asset is read as written, with or without a stray 0x in front", () => {
  const nvda = { chainId: 4663, address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" }
  assert.deepEqual(parseAsset(DEFAULT_REWARD_ASSET), nvda)
  assert.deepEqual(parseAsset(`0x${DEFAULT_REWARD_ASSET}`), nvda)
  assert.equal(parseAsset("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"), null)
  assert.equal(parseAsset("eip155:4663/erc721:0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"), null)
  assert.equal(parseAsset("eip155:4663/erc20:0xd0601c"), null)
})

test("amounts are read and written exactly", () => {
  assert.equal(parseUnitsExact("1.5", 18), 1_500_000_000_000_000_000n)
  assert.equal(parseUnitsExact("0.000000000000000001", 18), 1n)
  assert.equal(parseUnitsExact("12", 6), 12_000_000n)
  assert.equal(parseUnitsExact("0.0000000000000000001", 18), null)
  assert.equal(parseUnitsExact("-1", 18), null)
  assert.equal(parseUnitsExact("1e3", 18), null)
  assert.equal(parseUnitsExact("", 18), null)
  assert.equal(formatUnitsShort(1_500_000_000_000_000_000n, 18), "1.5")
  assert.equal(formatUnitsShort(1n, 18), "0")
  assert.equal(formatTokens(MINIMUM_UNITS), "3,000,000")
})

test("wallets are read strictly", () => {
  assert.deepEqual(parseWallets(""), [])
  assert.deepEqual(parseWallets(`${A}\n${B.toUpperCase().replace("0X", "0x")}, ${A}`), [A, B])
  assert.equal(parseWallets(`${A} 0x1234`), null)
})

// ---------------------------------------------------------------- hours

test("an hour is counted in UTC, from its first second up to the next hour", () => {
  const noon = Date.UTC(2026, 9, 12, 12) / 1000
  assert.equal(hourOf(noon), hourOf(noon + 3599))
  assert.equal(hourOf(noon + 3600), hourOf(noon) + 1)
  assert.equal(hourStart(hourOf(noon)), noon)
  assert.equal(hourEnd(hourOf(noon)), noon + 3600)
  assert.equal(hourLabel(hourOf(noon)), "2026-10-12 12:00 UTC")
})

// ---------------------------------------------------------------- counting

test("a wallet earns an hour only if it held the minimum through all of it", () => {
  const before = new Map([
    [A, tokens(5_000_000)],
    [B, tokens(3_000_000)],
    [C, tokens(2_999_999)],
  ])
  // Nothing moves: A and B held the minimum, C is one token short.
  assert.deepEqual(lotsThrough(before, [], MINIMUM_UNITS), [
    [A, 1],
    [B, 1],
  ])

  // B dips by one token and buys it back within the hour: out for that hour.
  const dipped = [move(B, C, tokens(1), 100), move(C, B, tokens(1), 101)]
  assert.deepEqual(lotsThrough(before, dipped, MINIMUM_UNITS), [[A, 1]])
})

test("a wallet earns by the lot: whole multiples of the minimum, by its lowest balance", () => {
  const before = new Map([
    [A, tokens(9_000_000)],
    [B, tokens(6_500_000)],
    [C, tokens(8_999_999)],
  ])
  assert.deepEqual(lotsThrough(before, [], MINIMUM_UNITS), [
    [A, 3],
    [B, 2],
    [C, 2],
  ])
  // A sells down to 6,000,000 for a moment: two lots for that hour, not three.
  const sold = [move(A, D, tokens(3_000_000), 100), move(D, A, tokens(3_000_000), 101)]
  assert.deepEqual(lotsThrough(before, sold, MINIMUM_UNITS)[0], [A, 2])
})

test("a wallet that arrives during the hour started the hour with nothing", () => {
  const before = new Map([[A, tokens(9_000_000)]])
  const arrived = [move(A, D, tokens(4_000_000), 100)]
  assert.deepEqual(lotsThrough(before, arrived, MINIMUM_UNITS), [[A, 1]])
  // The hour after, it has held throughout.
  assert.deepEqual(lotsThrough(balancesAfter(before, arrived), [], MINIMUM_UNITS), [
    [A, 1],
    [D, 1],
  ])
})

test("the order inside a block counts, and an address that never earns is left out", () => {
  const before = new Map([
    [A, tokens(4_000_000)],
    [B, tokens(800_000_000)],
  ])
  // Out and back in one block: the balance was under the minimum in between.
  const there = [move(A, C, tokens(2_000_000), 100), move(C, A, tokens(2_000_000), 100)]
  assert.deepEqual(lotsThrough(before, there, MINIMUM_UNITS), [[B, 266]])
  assert.deepEqual(lotsThrough(before, [], MINIMUM_UNITS, [B.toUpperCase()]), [[A, 1]])
})

test("balances follow the transfers, and an emptied wallet is dropped", () => {
  const after = balancesAfter(new Map(), [move(ZERO, A, tokens(10), 1), move(A, B, tokens(10), 2), move(B, C, tokens(4), 3)])
  assert.equal(after.has(A), false)
  assert.equal(after.get(B), tokens(6))
  assert.equal(after.get(C), tokens(4))
  // The address tokens are minted from ends up below nothing: it is nobody's balance.
  assert.equal(after.get(ZERO), -tokens(10))
})

// ---------------------------------------------------------------- what an hour pays

test("the ceiling is worked out as the contract works it out", () => {
  const began = Date.UTC(2026, 9, 12, 12) / 1000
  const changes: RateChange[] = [{ at: began, rate: 1000n, ceiling: 0n }]
  assert.equal(ceilingAt(changes, began - 1), 0n)
  assert.equal(ceilingAt(changes, began), 0n)
  assert.equal(ceilingAt(changes, began + 3600), 1000n)
  assert.equal(ceilingAt(changes, began + 9000), 2500n)

  // The rate triples after two hours: what the ceiling had reached is kept.
  const tripled: RateChange[] = [...changes, { at: began + 7200, rate: 3000n, ceiling: 2000n }]
  assert.equal(ceilingAt(tripled, began + 7200), 2000n)
  assert.equal(ceilingAt(tripled, began + 10800), 5000n)
  assert.equal(dueFor(tripled, hourOf(began)), 1000n)
  assert.equal(dueFor(tripled, hourOf(began) + 2), 3000n)
  // Nothing is due for an hour before the vault began.
  assert.equal(dueFor(tripled, hourOf(began) - 1), 0n)
})

test("an hour pays each lot the rate, or an even share of what is left when that is less", () => {
  assert.equal(shareOf(1000n, 3, 10_000n), 1000n)
  assert.equal(shareOf(1000n, 3, 3000n), 1000n)
  assert.equal(shareOf(1000n, 3, 2000n), 666n)
  assert.equal(shareOf(1000n, 3, 2n), 0n)
  assert.equal(shareOf(1000n, 3, 0n), 0n)
  assert.equal(shareOf(1000n, 3, -5n), 0n)
  assert.equal(shareOf(1000n, 0, 10_000n), 0n)
  assert.equal(shareOf(0n, 3, 10_000n), 0n)
})

test("the rate for a cent an hour follows from the reward's price", () => {
  assert.equal(HOURLY_CENTS, 1n)
  // 0.01 USD at 150 USD a piece is a fifteen-thousandth of one, rounded down.
  assert.equal(rateFor(1n, "150", 18), 66_666_666_666_666n)
  assert.equal(rateFor(1n, "172.40", 18), 10n ** 18n / 17_240n)
  assert.equal(rateFor(1n, "0.01", 18), 10n ** 18n)
  assert.equal(rateFor(1n, "100", 6), 100n)
  assert.equal(rateFor(1n, "0", 18), null)
  assert.equal(rateFor(1n, "-3", 18), null)
  assert.equal(rateFor(1n, "1e3", 18), null)
  assert.equal(rateFor(1n, "", 18), null)
})

// ---------------------------------------------------------------- the list, hashed

const LIST = [
  { wallet: A, amount: 500n },
  { wallet: B, amount: 300n },
  { wallet: C, amount: 150n },
  { wallet: D, amount: 40n },
  { wallet: wallet(0xe5), amount: 10n },
]

test("the list holds every wallet that earned anything, in the order of the addresses", () => {
  const earned = new Map([
    [C, 150n],
    [A.toUpperCase().replace("0X", "0x"), 500n],
    [D, 0n],
    [B, 300n],
  ])
  assert.deepEqual(linesOf(earned), LIST.slice(0, 3))
})

test("every line of a list proves itself under the root, for lists of every size", () => {
  for (let size = 1; size <= LIST.length; size++) {
    const lines = LIST.slice(0, size)
    const root = rootOf(lines)!
    lines.forEach((line, at) => {
      assert.equal(onTheList(root, line.wallet, line.amount, proofOf(lines, at)), true, `size ${size}, line ${at}`)
    })
  }
  assert.equal(rootOf([]), null)
  // One line: the root is that line's hash, and its proof is empty.
  assert.equal(rootOf(LIST.slice(0, 1)), leafOf(A, 500n))
  assert.deepEqual(proofOf(LIST.slice(0, 1), 0), [])
})

test("another amount or another wallet does not pass", () => {
  const root = rootOf(LIST)!
  const proof = proofOf(LIST, 1)
  assert.equal(onTheList(root, B, 300n, proof), true)
  assert.equal(onTheList(root, B, 301n, proof), false)
  assert.equal(onTheList(root, C, 300n, proof), false)
})

// These numbers are held on the contract's side too: contracts/test/ZolaceVault.t.sol works them
// out with ZolaceVault.leafOf and ZolaceVault.listHash, and claims with this very signature.
const SITE = {
  vault: "0x00000000000000000000000000000000000000f1" as const,
  hour: 489_600,
  key: `0x${"00".repeat(29)}0a11ce`,
  signer: "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7",
  leaf: "0x9b1e997aacb3216e82ea54212108e777af7ca8ad247b24c6af287453c3c3854d",
  root: "0xd596b951e59d04ddd6be920058c016b13b7779daac1646608c5350d57c1c0f90" as const,
  digest: "0xeb1f4f8a1ec092003b9eb8294fe5ee4f1b5cc7492340802894358082ee05ccd5",
  signature:
    "0x358eb8c60b5a23145a422ef84f5b428e6908aa8aa679577220b51038a66ef17f5cdc10ce8e56f454dee088d1494143de0ff8a35570d4dc210c775179832475271c",
}

test("a list is hashed and signed the way the contract checks it", async () => {
  assert.equal(leafOf(A, 500n), SITE.leaf)
  assert.equal(rootOf(LIST.slice(0, 3)), SITE.root)
  assert.equal(hashTypedData(listToSign(4663, SITE.vault, SITE.hour, SITE.root)), SITE.digest)

  await withEnv({ VAULT_SIGNER_KEY: SITE.key }, async () => {
    assert.equal(signerAddress(), SITE.signer)
    assert.equal(await signList(4663, SITE.vault, SITE.hour, SITE.root), SITE.signature)
    // A signature is for one vault on one network.
    assert.notEqual(await signList(46630, SITE.vault, SITE.hour, SITE.root), SITE.signature)
    assert.notEqual(await signList(4663, wallet(0xf2), SITE.hour, SITE.root), SITE.signature)
  })
})

test("without a signing key no list is signed", async () => {
  await withEnv({}, async () => {
    assert.equal(signerAddress(), null)
    assert.equal(await signList(4663, SITE.vault, SITE.hour, SITE.root), null)
  })
  await withEnv({ VAULT_SIGNER_KEY: "not a key" }, () => assert.equal(signerAddress(), null))
})

// ---------------------------------------------------------------- the count, hour by hour
//
// A chain made up for the test: one block a minute from the stroke of an hour, so hour k after
// that is blocks 60k to 60k + 59. The count is run against it exactly as it runs against the
// real one.

const FIRST = hourOf(Date.UTC(2026, 9, 12) / 1000)
const T0 = hourStart(FIRST)
const timeOf = (block: number) => T0 + block * 60
const POOL = wallet(0x9001)
const X = wallet(0x77)

function chainOf(story: {
  transfers: Transfer[]
  funded: { block: number; amount: bigint }[]
  rates: { block: number; rate: bigint; ceiling: bigint }[]
  now: () => number
}): Chain {
  const tip = () => Math.floor((Math.floor(story.now() / 1000) - T0) / 60)
  const within = (block: number | bigint, from: bigint, to: bigint) => BigInt(block) >= from && BigInt(block) <= to
  return {
    onTheTokensNetwork: async () => {},
    firstBlockAt: async (timestamp, lowest) => {
      const block = Math.max(Number(lowest), Math.ceil((timestamp - T0) / 60))
      return block > tip() ? null : BigInt(block)
    },
    transfersIn: async (from, to) => story.transfers.filter((transfer) => within(transfer.block, from, to)),
    fundedIn: async (from, to) => story.funded.filter((entry) => within(entry.block, from, to)).reduce((sum, entry) => sum + entry.amount, 0n),
    rateChangesIn: async (from, to) =>
      story.rates.filter((entry) => within(entry.block, from, to)).map((entry) => ({ at: timeOf(entry.block), rate: entry.rate, ceiling: entry.ceiling })),
    vaultBegan: async () => (story.rates.length > 0 ? { block: BigInt(story.rates[0].block), at: timeOf(story.rates[0].block) } : null),
    neverEarn: async () => [ZERO, POOL],
  }
}

// Two minutes into the hour after hour k: hour k is over and settled.
const afterHour = (k: number) => (hourEnd(FIRST + k) + 120) * 1000

test("the count pays each hour by the lot to the wallets that held through it, and no more than was put in", async () => {
  const store = await import("../lib/vault-store")
  const vault = wallet(0xf00d)
  let now = afterHour(2)
  const story = {
    now: () => now,
    transfers: [
      move(ZERO, POOL, tokens(800_000_000), 1),
      // A holds two lots, B one, and C is under the minimum.
      move(ZERO, A, tokens(7_000_000), 1),
      move(ZERO, B, tokens(3_000_000), 2),
      move(ZERO, C, tokens(2_900_000), 3),
      // Hour 3: B dips by one token and buys it back; D arrives with one lot.
      move(B, X, tokens(1), 200),
      move(X, B, tokens(1), 201),
      move(POOL, D, tokens(4_000_000), 210),
    ],
    // The vault begins half way through hour 2, at 1000 units an hour for a lot, and is given 10,000.
    rates: [
      { block: 150, rate: 1000n, ceiling: 0n },
      // Half way through hour 9 the rate doubles. By then the ceiling has run for seven hours.
      { block: 570, rate: 2000n, ceiling: 7000n },
    ],
    funded: [
      { block: 151, amount: 10_000n },
      { block: 500, amount: 3_000n },
      { block: 541, amount: 100_000n },
    ],
  }
  const chain = chainOf(story)

  await withEnv({ TOKEN_ADDRESS: wallet(0x70), VAULT_ADDRESS: vault, TOKEN_DEPLOY_BLOCK: "0" }, async () => {
    // Hour 2, the vault's first: half an hour of the rate for each of the three lots.
    assert.deepEqual(await store.advance(now, 24, chain), { counted: 1, hour: FIRST + 2, behind: 0 })
    let list = (await store.published())!
    assert.deepEqual(list.list, [
      [A, "1000"],
      [B, "500"],
    ])
    assert.equal(list.funded, "10000")
    assert.equal(list.total, "1500")
    assert.equal(list.root, rootOf([{ wallet: A, amount: 1000n }, { wallet: B, amount: 500n }]))

    // Asked again, nothing is counted twice.
    assert.deepEqual(await store.advance(now, 24, chain), { counted: 0, hour: FIRST + 2, behind: 0 })
    assert.equal((await store.published())!.total, "1500")

    // At most two hours in one go: the rest waits for the next round.
    now = afterHour(9)
    assert.deepEqual(await store.advance(now, 2, chain), { counted: 2, hour: FIRST + 4, behind: 5 })
    assert.deepEqual(await store.advance(now, 24, chain), { counted: 5, hour: FIRST + 9, behind: 0 })

    const hours = (await store.recentHours(24)).reverse()
    assert.deepEqual(
      hours.map((hour) => [hour.hour - FIRST, hour.wallets, hour.lots, hour.each]),
      [
        [2, [[A, 2], [B, 1]], 3, "500"],
        // B dipped and D arrived during the hour: only A held throughout.
        [3, [[A, 2]], 2, "1000"],
        [4, [[A, 2], [B, 1], [D, 1]], 4, "1000"],
        // 2,500 are left of the 10,000: an even share for each of the four lots.
        [5, [[A, 2], [B, 1], [D, 1]], 4, "625"],
        // Nothing is left, so the hours pay nothing.
        [6, [[A, 2], [B, 1], [D, 1]], 4, "0"],
        [7, [[A, 2], [B, 1], [D, 1]], 4, "0"],
        // 3,000 more arrive: less than the rate for four lots, so it is shared.
        [8, [[A, 2], [B, 1], [D, 1]], 4, "750"],
        // 100,000 more, and half the hour at 1000 and half at 2000.
        [9, [[A, 2], [B, 1], [D, 1]], 4, "1500"],
      ]
    )
    assert.deepEqual(
      hours.map((hour) => [hour.fromBlock, hour.toBlock]),
      [2, 3, 4, 5, 6, 7, 8, 9].map((k) => [60 * k, 60 * k + 59])
    )

    list = (await store.published())!
    assert.equal(list.hour, FIRST + 9)
    assert.deepEqual(list.list, [
      [A, "10750"],
      [B, "4375"],
      [D, "3875"],
    ])
    assert.equal(list.total, "19000")
    assert.equal(list.funded, "113000")
    // The pool holds most of the supply and is never listed; C never reached the minimum.
    assert.equal(list.list.some(([listed]) => listed === POOL || listed === C), false)

    // All of it together stays under what the contract's ceiling allows the lots there were, and
    // never exceeds what the vault was given.
    const rates = story.rates.map((entry) => ({ at: timeOf(entry.block), rate: entry.rate, ceiling: entry.ceiling }))
    assert.equal(ceilingAt(rates, hourEnd(FIRST + 9)), 8000n)
    assert.ok(BigInt(list.total) <= ceilingAt(rates, hourEnd(FIRST + 9)) * 4n)
    assert.ok(BigInt(list.total) <= BigInt(list.funded))
  })

  // An hour that is not over on the chain is not counted, however late the server's clock says it is.
  await withEnv({ TOKEN_ADDRESS: wallet(0x70), VAULT_ADDRESS: vault, TOKEN_DEPLOY_BLOCK: "0" }, async () => {
    const stuck = chainOf({ ...story, now: () => afterHour(9) })
    assert.deepEqual(await store.advance(afterHour(12), 24, stuck), { counted: 0, hour: FIRST + 9, behind: 3 })
  })

  // Another vault starts another count: nothing of the old one is carried over.
  await withEnv({ TOKEN_ADDRESS: wallet(0x70), VAULT_ADDRESS: wallet(0xbeef), TOKEN_DEPLOY_BLOCK: "0" }, async () => {
    const other = chainOf({ ...story, rates: [{ block: 660, rate: 10n, ceiling: 0n }], funded: [{ block: 661, amount: 1_000n }], now: () => afterHour(11) })
    assert.deepEqual(await store.advance(afterHour(11), 24, other), { counted: 1, hour: FIRST + 11, behind: 0 })
    const list = (await store.published())!
    assert.deepEqual(list.list, [
      [A, "20"],
      [B, "10"],
      [D, "10"],
    ])
    assert.equal((await store.recentHours(24)).length, 1)
  })
})

test("with the vault switched off, or no contract at its address, nothing is counted", async () => {
  const store = await import("../lib/vault-store")
  await withEnv({}, async () => {
    const result = await store.advance(afterHour(3))
    assert.equal(result.counted, 0)
    assert.equal(result.hour, null)
    assert.equal(await store.published(), null)
  })
  await withEnv({ TOKEN_ADDRESS: wallet(0x70), VAULT_ADDRESS: wallet(0xcafe), TOKEN_DEPLOY_BLOCK: "0" }, async () => {
    const empty = chainOf({ transfers: [], funded: [], rates: [], now: () => afterHour(3) })
    const result = await store.advance(afterHour(3), 24, empty)
    assert.equal(result.hour, null)
    assert.match(result.note ?? "", /no vault contract/)
  })
})
