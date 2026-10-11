import { createPublicClient, http, parseAbi, parseAbiItem, type PublicClient } from "viem"

import { tokenConfig, vaultLive, type TokenConfig } from "@/lib/token"
import { VAULT_ABI, type Transfer } from "@/lib/vault"

// What the vault reads from the chain. All of it is public data: transfers and contract state
// that anyone can read, so anyone can do the same sums. The server only reads. It has no key for
// this chain and sends nothing to it: the owner funds a month, and a holder claims, each from
// their own wallet.

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")

const TOKEN_ROLES = parseAbi(["function owner() view returns (address)", "function feeCollector() view returns (address)"])

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

// The first block whose time is `timestamp` (in seconds) or later. Null when the chain has not
// got that far. Found by halving the range, so it asks for a few dozen blocks, not millions.
async function firstBlockAt(client: PublicClient, timestamp: bigint, lowest: bigint) {
  const tip = await client.getBlock()
  if (tip.timestamp < timestamp) return null

  let low = lowest
  let high = tip.number
  while (low < high) {
    const middle = (low + high) / 2n
    const block = await client.getBlock({ blockNumber: middle })
    if (block.timestamp >= timestamp) high = middle
    else low = middle + 1n
  }
  return low
}

// The blocks a stretch of time ran over, both included. `start` and `end` are in seconds.
export async function blocksBetween(start: number, end: number) {
  const { config, client } = live()
  // A month counted on another network than the token's would look right and be wrong.
  const answering = await client.getChainId()
  if (answering !== config.chainId) {
    throw new ChainError(`TOKEN_RPC_URL answers for network ${answering}, and the token is set to network ${config.chainId}.`)
  }
  const from = await firstBlockAt(client, BigInt(start), config.deployBlock)
  const after = await firstBlockAt(client, BigInt(end) + 1n, config.deployBlock)
  if (from === null || after === null) throw new ChainError("The chain has not reached the end of that month yet.")
  if (after <= from) throw new ChainError("The chain has no block in that month.")
  return { fromBlock: from, toBlock: after - 1n }
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
async function logsIn(client: PublicClient, address: `0x${string}`, fromBlock: bigint, toBlock: bigint): Promise<Transfer[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const logs = await client.getLogs({ address, event: TRANSFER, fromBlock, toBlock })
      return logs.map((log) => ({
        from: log.args.from as string,
        to: log.args.to as string,
        value: log.args.value as bigint,
        block: log.blockNumber,
        index: log.logIndex,
      }))
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
      const first = await logsIn(client, address, fromBlock, middle)
      const second = await logsIn(client, address, middle + 1n, toBlock)
      return [...first, ...second]
    }
  }
}

// Every transfer of the token, from its first block to `toBlock`. It has to reach back to the
// start: a wallet's balance is the sum of everything that ever moved in and out of it.
export async function allTransfers(toBlock: bigint): Promise<Transfer[]> {
  const { config, client } = live()
  if (toBlock < config.deployBlock) return []
  return logsIn(client, config.address, config.deployBlock, toBlock)
}

// Wallets that never take part in a month: the token's owner and its fee collector (the project's
// own), the vault, and the address tokens are minted from. Read from the token itself.
export async function ownWallets(): Promise<string[]> {
  const { config, client } = live()
  const read = (functionName: "owner" | "feeCollector") =>
    client.readContract({ address: config.address, abi: TOKEN_ROLES, functionName }).catch(() => null)
  const [owner, collector] = await Promise.all([read("owner"), read("feeCollector")])
  return [owner, collector, config.vault, "0x0000000000000000000000000000000000000000"]
    .filter((wallet): wallet is `0x${string}` => typeof wallet === "string")
    .map((wallet) => wallet.toLowerCase())
}

// Which of these addresses are contracts. A contract on a month's list can only be paid if
// someone sends its claim for it, and a pool or a bridge never spends what it is paid.
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

// A month as the vault's contract holds it. A month that was not funded has an empty root.
export async function fundedMonth(id: number) {
  const { config, client } = live()
  const [root, total, claimed] = await client.readContract({
    address: config.vault,
    abi: VAULT_ABI,
    functionName: "months",
    args: [id],
  })
  return { root, total, claimed, funded: BigInt(root) !== 0n }
}
