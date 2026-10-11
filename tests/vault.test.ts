import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_REWARD_ASSET,
  formatTokens,
  formatUnitsShort,
  MINIMUM_UNITS,
  parseAsset,
  parseUnitsExact,
  tokenConfig,
  vaultLive,
} from "../lib/token"
import {
  lastMonth,
  leafOf,
  lowestBalances,
  monthBounds,
  onTheList,
  parseWallets,
  periodId,
  proofOf,
  rootOf,
  splitReward,
  type Transfer,
} from "../lib/vault"

const ZERO = "0x0000000000000000000000000000000000000000"
const wallet = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`
const A = wallet(0xa1)
const B = wallet(0xb2)
const C = wallet(0xc3)
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

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const names = ["TOKEN_ADDRESS", "TOKEN_CHAIN_ID", "TOKEN_RPC_URL", "TOKEN_DEPLOY_BLOCK", "VAULT_ADDRESS", "REWARD_ASSET", "REWARD_SYMBOL", "REWARD_DECIMALS"]
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  for (const name of names) delete process.env[name]
  for (const [name, value] of Object.entries(values)) if (value !== undefined) process.env[name] = value
  try {
    run()
  } finally {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name]
      else process.env[name] = before[name]
    }
  }
}

test("with nothing set there is no token, and the reward is NVDA on Robinhood Chain", () => {
  withEnv({}, () => {
    const config = tokenConfig()
    assert.equal(config.address, null)
    assert.equal(config.vault, null)
    assert.equal(config.chainId, 4663)
    assert.deepEqual(config.reward, {
      address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
      symbol: "NVDA",
      decimals: 18,
    })
    assert.equal(vaultLive(config), false)
  })
})

test("the vault is open once the token and the vault have an address", () => {
  withEnv({ TOKEN_ADDRESS: A, VAULT_ADDRESS: B, TOKEN_DEPLOY_BLOCK: "120" }, () => {
    const config = tokenConfig()
    assert.equal(vaultLive(config), true)
    assert.equal(config.deployBlock, 120n)
  })
  withEnv({ TOKEN_ADDRESS: A }, () => assert.equal(vaultLive(tokenConfig()), false))
  withEnv({ TOKEN_ADDRESS: "not an address", VAULT_ADDRESS: B }, () => assert.equal(vaultLive(tokenConfig()), false))
})

test("a reward on another network than the token switches the vault off", () => {
  // The token on the test network, the reward left at its default on mainnet.
  withEnv({ TOKEN_ADDRESS: A, VAULT_ADDRESS: B, TOKEN_CHAIN_ID: "46630" }, () => {
    const config = tokenConfig()
    assert.equal(config.reward, null)
    assert.equal(vaultLive(config), false)
  })
  withEnv(
    { TOKEN_ADDRESS: A, VAULT_ADDRESS: B, TOKEN_CHAIN_ID: "46630", REWARD_ASSET: `eip155:46630/erc20:${C}`, REWARD_SYMBOL: "TEST", REWARD_DECIMALS: "6" },
    () => {
      const config = tokenConfig()
      assert.deepEqual(config.reward, { address: C, symbol: "TEST", decimals: 6 })
      assert.equal(vaultLive(config), true)
    }
  )
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

test("wallets to leave out are read strictly", () => {
  assert.deepEqual(parseWallets(""), [])
  assert.deepEqual(parseWallets(`${A}\n${B.toUpperCase().replace("0X", "0x")}, ${A}`), [A, B])
  assert.equal(parseWallets(`${A} 0x1234`), null)
})

// ---------------------------------------------------------------- counting

test("what counts is the lowest balance of the month, not the balance at its end", () => {
  const transfers = [
    move(ZERO, A, tokens(5_000_000), 10),
    move(ZERO, B, tokens(5_000_000), 10),
    // A dips in the month and buys back before it ends.
    move(A, C, tokens(4_000_000), 120),
    move(C, A, tokens(4_000_000), 180),
  ]
  const lowest = lowestBalances(transfers, 100n, 200n)
  assert.equal(lowest.get(A), tokens(1_000_000))
  assert.equal(lowest.get(B), tokens(5_000_000))
  assert.equal(lowest.get(C), 0n)
})

test("a wallet that arrives during the month started the month with nothing", () => {
  const transfers = [move(ZERO, A, tokens(9_000_000), 10), move(A, B, tokens(4_000_000), 150)]
  const lowest = lowestBalances(transfers, 100n, 200n)
  assert.equal(lowest.get(B), 0n)
  assert.equal(lowest.get(A), tokens(5_000_000))
})

test("what happens after the month does not count, and the order in a block does", () => {
  const transfers = [
    move(ZERO, A, tokens(4_000_000), 10),
    move(A, B, tokens(4_000_000), 201),
    // Out and back in one block: the balance was zero in between.
    move(ZERO, C, tokens(4_000_000), 10),
    move(C, B, tokens(4_000_000), 150),
    move(B, C, tokens(4_000_000), 150),
  ]
  const lowest = lowestBalances(transfers, 100n, 200n)
  assert.equal(lowest.get(A), tokens(4_000_000))
  assert.equal(lowest.get(C), 0n)
})

test("the reward is split by lowest balance among wallets at the minimum", () => {
  const lowest = new Map([
    [A, tokens(3_000_000)],
    [B, tokens(6_000_000)],
    [C, tokens(2_999_999)],
  ])
  const { lines, left } = splitReward(900n, lowest, MINIMUM_UNITS)
  assert.deepEqual(
    lines.map((line) => [line.wallet, line.amount]),
    [
      [B, 600n],
      [A, 300n],
    ]
  )
  assert.equal(left, 0n)
})

test("parts are rounded down, so the list never promises more than went in", () => {
  const lowest = new Map([
    [A, tokens(3_000_000)],
    [B, tokens(3_000_000)],
    [C, tokens(3_000_000)],
  ])
  const { lines, left } = splitReward(100n, lowest, MINIMUM_UNITS)
  assert.equal(lines.reduce((sum, line) => sum + line.amount, 0n), 99n)
  assert.equal(left, 1n)
})

test("wallets left out take no part, and nobody at the minimum means nobody is listed", () => {
  const lowest = new Map([
    [A, tokens(3_000_000)],
    [B, tokens(6_000_000)],
  ])
  const without = splitReward(900n, lowest, MINIMUM_UNITS, [B.toUpperCase()])
  assert.deepEqual(without.lines.map((line) => [line.wallet, line.amount]), [[A, 900n]])

  const nobody = splitReward(900n, new Map([[A, tokens(1)]]), MINIMUM_UNITS)
  assert.deepEqual(nobody, { lines: [], left: 900n })
})

// ---------------------------------------------------------------- months

test("a month runs from its first second to its last, in UTC", () => {
  assert.deepEqual(monthBounds("2026-09"), {
    start: Date.UTC(2026, 8, 1) / 1000,
    end: Date.UTC(2026, 9, 1) / 1000 - 1,
  })
  assert.deepEqual(monthBounds("2026-12"), {
    start: Date.UTC(2026, 11, 1) / 1000,
    end: Date.UTC(2027, 0, 1) / 1000 - 1,
  })
  assert.equal(monthBounds("2026-13"), null)
  assert.equal(monthBounds("2026-9"), null)
  assert.equal(periodId("2026-09"), 202609)
  assert.equal(lastMonth(Date.UTC(2026, 9, 11)), "2026-09")
  assert.equal(lastMonth(Date.UTC(2027, 0, 1)), "2026-12")
})

// ---------------------------------------------------------------- the list, hashed

const LIST = [
  { wallet: A, amount: 500n },
  { wallet: B, amount: 300n },
  { wallet: C, amount: 150n },
  { wallet: wallet(0xd4), amount: 40n },
  { wallet: wallet(0xe5), amount: 10n },
]

test("every line of a list proves itself under the root, for lists of every size", () => {
  for (let size = 1; size <= LIST.length; size++) {
    const lines = LIST.slice(0, size)
    const root = rootOf(202609, lines)!
    lines.forEach((line, at) => {
      assert.equal(onTheList(root, 202609, line.wallet, line.amount, proofOf(202609, lines, at)), true, `size ${size}, line ${at}`)
    })
  }
  assert.equal(rootOf(202609, []), null)
  // One line: the root is that line's hash, and its proof is empty.
  assert.equal(rootOf(202609, LIST.slice(0, 1)), leafOf(202609, A, 500n))
  assert.deepEqual(proofOf(202609, LIST.slice(0, 1), 0), [])
})

test("another amount, another wallet or another month does not pass", () => {
  const root = rootOf(202609, LIST)!
  const proof = proofOf(202609, LIST, 1)
  assert.equal(onTheList(root, 202609, B, 300n, proof), true)
  assert.equal(onTheList(root, 202609, B, 301n, proof), false)
  assert.equal(onTheList(root, 202609, C, 300n, proof), false)
  assert.equal(onTheList(root, 202610, B, 300n, proof), false)
  assert.notEqual(rootOf(202610, LIST), root)
})

// Both numbers are held on the contract's side too: contracts/test/ZolaceVault.t.sol works them
// out with ZolaceVault.leafOf, funds a month with this root and claims against it.
test("a list is hashed the way the contract hashes it", () => {
  assert.equal(leafOf(202609, A, 500n), "0xc7ac3adac7bdafc55109eaf871f2ec5458a6b4c0ffe2a6af19a3a9709df42f73")
  assert.equal(rootOf(202609, LIST.slice(0, 3)), "0x49dd6bbaed9ae7aa66c1b6ff6ccffac99f98b0bb611d529d96fa040098231bf8")
})
