import { createPublicClient, http, parseAbi, parseAbiItem, type PublicClient } from "viem"

import { tokenConfig, vaultLive, type TokenConfig } from "@/lib/token"
import { REWARD_ABI, VAULT_ABI, type RateChange, type Transfer } from "@/lib/vault"

// What the vault reads from the chain. All of it is public data: transfers and contract state
// that anyone can read, so anyone can do the same sums. This file only reads. It holds no key and
// sends nothing: the owner funds the vault, and a holder claims, each from their own wallet.

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")
const RATE_SET = parseAbiItem("event RateSet(uint256 rate, uint256 ceiling)")

// A token launched on Pons names the curve it is sold from.
const TOKEN_PARTS = parseAbi(["function curve() view returns (address)"])

const NOBODY = "0x0000000000000000000000000000000000000000"
const DEAD = "0x000000000000000000000000000000000000dead"

export class ChainError extends Error {}

function reader(config: TokenConfig): PublicClient {
  // A public endpoint answers "too many requests" quickly: each call is tried again a few times,
  // a little later each time, before it counts as failed.
  return createPublicClient({ transport: http(config.rpcUrl, { timeout: 20_000, retryCount: 5, retryDelay: 400 }) })
}

// The token and the vault have to be switched on (lib/token.ts) before anything here can run.
function live() {
  const config = tokenConfig()
  if (!vaultLive(config)) throw new ChainError("The vault is not switched on: the token, the vault or the reward is not set.")
  return { config, client: reader(config) }
}

// Hours counted on another network than the token's would look right and be wrong.
export async function onTheTokensNetwork() {
  const { config, client } = live()
  const answering = await client.getChainId()
  if (answering !== config.chainId) {
    throw new ChainError(`TOKEN_RPC_URL answers for network ${answering}, and the token is set to network ${config.chainId}.`)
  }
}

// The first block whose time is `timestamp` (in seconds) or later, looking no lower than
// `lowest`. Null when the chain has not got that far. Found by halving the range, so it asks for
// a few dozen blocks, not millions.
export async function firstBlockAt(timestamp: number, lowest: bigint) {
  const { client } = live()
  const tip = await client.getBlock()
  if (tip.timestamp < BigInt(timestamp)) return null

  let low = lowest
  let high = tip.number
  while (low < high) {
    const middle = (low + high) / 2n
    const block = await client.getBlock({ blockNumber: middle })
    if (block.timestamp >= BigInt(timestamp)) high = middle
    else low = middle + 1n
  }
  return low
}

// Whether an endpoint refused a call because it is asked too often, not because of what was asked.
function askedTooOften(error: unknown) {
  const told = error as { status?: number; code?: number; message?: string; details?: string }
  // By its words, not by a bare 429 in the text: the message carries block numbers, which may hold those digits.
  return told.status === 429 || told.code === 429 || /too many requests|rate limit/i.test(`${told.message} ${told.details}`)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// A provider answers only so many blocks or results at once. A stretch it refuses is cut in two
// and asked again, down to a stretch too short to be the problem. Being asked too often is another
// matter: cutting the stretch would only ask more often, so the same stretch waits and is asked
// again (seen on Robinhood Chain's public endpoint, 11 Oct 2026).
async function stretch<Found>(fromBlock: bigint, toBlock: bigint, ask: (from: bigint, to: bigint) => Promise<Found[]>): Promise<Found[]> {
  if (toBlock < fromBlock) return []
  for (let attempt = 0; ; attempt++) {
    try {
      return await ask(fromBlock, toBlock)
    } catch (error) {
      if (askedTooOften(error)) {
        if (attempt >= 5) {
          throw new ChainError("The endpoint keeps answering that it is asked too often. Try again later, or use a provider's endpoint for TOKEN_RPC_URL.")
        }
        await wait(2_000 * 2 ** attempt)
        continue
      }
      if (toBlock - fromBlock < 1_000n) throw error
      const middle = (fromBlock + toBlock) / 2n
      const first = await stretch(fromBlock, middle, ask)
      const second = await stretch(middle + 1n, toBlock, ask)
      return [...first, ...second]
    }
  }
}

// Every transfer of the token in a stretch of blocks, both ends included.
export async function transfersIn(fromBlock: bigint, toBlock: bigint): Promise<Transfer[]> {
  const { config, client } = live()
  return stretch(fromBlock, toBlock, async (from, to) => {
    const logs = await client.getLogs({ address: config.address, event: TRANSFER, fromBlock: from, toBlock: to })
    return logs.map((log) => ({
      from: log.args.from as string,
      to: log.args.to as string,
      value: log.args.value as bigint,
      block: log.blockNumber,
      index: log.logIndex,
    }))
  })
}

// How much of the reward arrived at the vault in a stretch of blocks. The vault is funded by a
// plain transfer to its address, so what went in is the reward's own transfers to it.
export async function fundedIn(fromBlock: bigint, toBlock: bigint) {
  const { config, client } = live()
  const amounts = await stretch(fromBlock, toBlock, async (from, to) => {
    const logs = await client.getLogs({ address: config.reward.address, event: TRANSFER, args: { to: config.vault }, fromBlock: from, toBlock: to })
    return logs.map((log) => log.args.value as bigint)
  })
  return amounts.reduce((sum, amount) => sum + amount, 0n)
}

// Each time the vault's rate was set in a stretch of blocks, with the time of its block: the
// contract counts the ceiling from that very second.
export async function rateChangesIn(fromBlock: bigint, toBlock: bigint): Promise<RateChange[]> {
  const { config, client } = live()
  const logs = await stretch(fromBlock, toBlock, (from, to) =>
    client.getLogs({ address: config.vault, event: RATE_SET, fromBlock: from, toBlock: to })
  )
  const changes: RateChange[] = []
  for (const log of logs) {
    const block = await client.getBlock({ blockNumber: log.blockNumber })
    changes.push({ at: Number(block.timestamp), rate: log.args.rate as bigint, ceiling: log.args.ceiling as bigint })
  }
  return changes
}

// When the vault began: the block its contract was made in, which is where its rate was first
// set. Null while there is no such contract at the vault's address.
export async function vaultBegan() {
  const { config, client } = live()
  const tip = await client.getBlockNumber()
  const STEP = 5_000_000n
  for (let from = config.deployBlock; from <= tip; from += STEP) {
    const to = from + STEP - 1n < tip ? from + STEP - 1n : tip
    const logs = await stretch(from, to, (low, high) =>
      client.getLogs({ address: config.vault, event: RATE_SET, fromBlock: low, toBlock: high })
    )
    if (logs.length > 0) {
      const block = await client.getBlock({ blockNumber: logs[0].blockNumber })
      return { block: block.number, at: Number(block.timestamp) }
    }
  }
  return null
}

// Addresses that never earn: nobody's (where tokens are minted from and burned to), the vault,
// the curve the token is sold from, and whatever the owner named in VAULT_SKIP.
export async function neverEarn(): Promise<string[]> {
  const { config, client } = live()
  const curve = await client.readContract({ address: config.address, abi: TOKEN_PARTS, functionName: "curve" }).catch(() => null)
  return [...new Set([NOBODY, DEAD, config.vault, curve, ...config.skip].filter((wallet): wallet is `0x${string}` => typeof wallet === "string").map((wallet) => wallet.toLowerCase()))]
}

// Which of these addresses are contracts. A contract on the list can only be paid if someone
// sends its claim for it, and a pool or a bridge never spends what it is paid.
export async function contractsAmong(wallets: `0x${string}`[]): Promise<Set<string>> {
  const { client } = live()
  const found = new Set<string>()
  await Promise.all(
    wallets.map(async (wallet) => {
      const code = await client.getCode({ address: wallet }).catch(() => undefined)
      if (code && code !== "0x") found.add(wallet.toLowerCase())
    })
  )
  return found
}

// What an address has taken from the vault so far.
export async function takenBy(wallet: `0x${string}`) {
  const { config, client } = live()
  return (await client.readContract({ address: config.vault, abi: VAULT_ABI, functionName: "claimed", args: [wallet] })) as bigint
}

// The vault's contract as it stands now: who signs, the rate, how far the ceiling has risen and
// for how many lots it counts, what was taken, and what the vault still holds.
export async function vaultNow() {
  const { config, client } = live()
  const read = <Name extends "signer" | "rate" | "lots" | "ceiling" | "totalClaimed">(functionName: Name) =>
    client.readContract({ address: config.vault, abi: VAULT_ABI, functionName })
  const [signer, rate, lots, ceiling, taken, holds] = await Promise.all([
    read("signer"),
    read("rate"),
    read("lots"),
    read("ceiling"),
    read("totalClaimed"),
    client.readContract({ address: config.reward.address, abi: REWARD_ABI, functionName: "balanceOf", args: [config.vault] }),
  ])
  return { signer: signer as `0x${string}`, rate: rate as bigint, lots: lots as bigint, ceiling: ceiling as bigint, taken: taken as bigint, holds }
}
