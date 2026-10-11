import { concat, encodeAbiParameters, keccak256, parseAbi } from "viem"

// The vault: how holders of the token are rewarded (CONTRACT.md). Once a month the owner puts the
// reward into the vault's contract, together with the root of a list of who gets how much, and a
// wallet on the list claims its part from the contract. This file is the part with no database
// and no network in it: how a month's list is worked out from the token's transfers, and how the
// list is hashed into the root the contract checks claims against.
//
// Everything here is done from public data, so anyone can do the same sums and check a root.

// ---------------------------------------------------------------- counting

// One movement of the token, as the chain reports it.
export type Transfer = { from: string; to: string; value: bigint; block: bigint; index: number }

// The lowest balance every wallet had from `fromBlock` to `toBlock`, both included. A wallet
// starts from what it held going into `fromBlock`, so the transfers have to reach back to the
// token's first. One counted block could be met by buying just before it and selling just after;
// the lowest balance of the whole month cannot.
export function lowestBalances(transfers: Transfer[], fromBlock: bigint, toBlock: bigint) {
  const ordered = transfers
    .filter((transfer) => transfer.block <= toBlock)
    .sort((a, b) => (a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1))

  const balance = new Map<string, bigint>()
  const lowest = new Map<string, bigint>()
  const move = (wallet: string, by: bigint, inMonth: boolean) => {
    const who = wallet.toLowerCase()
    const before = balance.get(who) ?? 0n
    const after = before + by
    balance.set(who, after)
    if (!inMonth) return
    // The first movement inside the month: what the wallet held until then is where it starts.
    const floor = lowest.get(who) ?? before
    lowest.set(who, after < floor ? after : floor)
  }

  for (const transfer of ordered) {
    const inMonth = transfer.block >= fromBlock
    move(transfer.from, -transfer.value, inMonth)
    move(transfer.to, transfer.value, inMonth)
  }
  // A wallet with no movement in the month held the same amount throughout.
  for (const [wallet, held] of balance) if (!lowest.has(wallet)) lowest.set(wallet, held)
  return lowest
}

export type Line = { wallet: `0x${string}`; lowest: bigint; amount: bigint }

// Splits a month's reward among the wallets whose lowest balance reached the minimum, by that
// lowest balance. Each part is rounded down to a whole unit, so what is promised never exceeds
// what is put in; `left` is what the rounding kept back. Wallets in `skip` take no part: the
// token's own wallets and contracts that could never claim, such as an exchange pool.
export function splitReward(pool: bigint, lowest: Map<string, bigint>, minimum: bigint, skip: string[] = []) {
  const out = new Set(skip.map((wallet) => wallet.toLowerCase()))
  const counted = [...lowest]
    .filter(([wallet, held]) => held >= minimum && !out.has(wallet))
    .map(([wallet, held]) => ({ wallet: wallet as `0x${string}`, lowest: held }))
  const total = counted.reduce((sum, holder) => sum + holder.lowest, 0n)
  if (total === 0n || pool <= 0n) return { lines: [] as Line[], left: pool > 0n ? pool : 0n }

  const lines = counted
    .map((holder) => ({ ...holder, amount: (pool * holder.lowest) / total }))
    .filter((line) => line.amount > 0n)
    .sort((a, b) => (a.lowest === b.lowest ? a.wallet.localeCompare(b.wallet) : a.lowest > b.lowest ? -1 : 1))
  return { lines, left: pool - lines.reduce((sum, line) => sum + line.amount, 0n) }
}

// Wallet addresses as the owner types them, apart by spaces, commas or lines. Null when one of
// them is not an address: a mistyped wallet must not be passed over in silence.
export function parseWallets(text: string): `0x${string}`[] | null {
  const words = text.split(/[\s,;]+/).filter(Boolean)
  if (words.some((word) => !/^0x[0-9a-fA-F]{40}$/.test(word))) return null
  return [...new Set(words.map((word) => word.toLowerCase() as `0x${string}`))]
}

// ---------------------------------------------------------------- months

// The first and the last second of a calendar month in UTC, from "2026-10".
export function monthBounds(period: string): { start: number; end: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  return { start: Date.UTC(year, month - 1, 1) / 1000, end: Date.UTC(year, month, 1) / 1000 - 1 }
}

// A month as the contract numbers it: "2026-09" is 202609.
export const periodId = (period: string) => Number(period.replace("-", ""))

// The month before the one `now` (in milliseconds) falls in: the newest month that is over.
export function lastMonth(now = Date.now()) {
  const date = new Date(now)
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`
}

// ---------------------------------------------------------------- the list, hashed

type Hash = `0x${string}`

// One line of a month's list, hashed the way the contract hashes it (ZolaceVault.leafOf): the
// month, the wallet and the amount, hashed twice.
export function leafOf(id: number, wallet: `0x${string}`, amount: bigint): Hash {
  return keccak256(
    keccak256(encodeAbiParameters([{ type: "uint32" }, { type: "address" }, { type: "uint256" }], [id, wallet, amount]))
  )
}

// Two hashes into one. The smaller goes first, so a proof does not have to say left or right.
const pair = (a: Hash, b: Hash): Hash => keccak256(concat(BigInt(a) < BigInt(b) ? [a, b] : [b, a]))

// The layers of the tree over a month's lines, from the hashed lines up to the root. An odd hash
// at the end of a layer is carried up as it is.
function layersOf(id: number, lines: { wallet: `0x${string}`; amount: bigint }[]) {
  let layer = lines.map((line) => leafOf(id, line.wallet, line.amount))
  const layers = [layer]
  while (layer.length > 1) {
    const next: Hash[] = []
    for (let at = 0; at < layer.length; at += 2) {
      next.push(at + 1 < layer.length ? pair(layer[at], layer[at + 1]) : layer[at])
    }
    layers.push(next)
    layer = next
  }
  return layers
}

// The root of a month's list: the one hash the contract keeps. An empty list has none.
export function rootOf(id: number, lines: { wallet: `0x${string}`; amount: bigint }[]): Hash | null {
  if (lines.length === 0) return null
  return layersOf(id, lines).at(-1)![0]
}

// The hashes that tie one line to the root: what a wallet sends along when it claims.
export function proofOf(id: number, lines: { wallet: `0x${string}`; amount: bigint }[], index: number): Hash[] {
  const proof: Hash[] = []
  let at = index
  for (const layer of layersOf(id, lines).slice(0, -1)) {
    const sibling = at % 2 === 0 ? at + 1 : at - 1
    if (sibling < layer.length) proof.push(layer[sibling])
    at = Math.floor(at / 2)
  }
  return proof
}

// What the contract does with a proof, done here: whether a line belongs under a root.
export function onTheList(root: Hash, id: number, wallet: `0x${string}`, amount: bigint, proof: Hash[]) {
  return proof.reduce((hash, sibling) => pair(hash, sibling), leafOf(id, wallet, amount)) === root
}

// ---------------------------------------------------------------- the contracts

// The parts of the vault's contract the site reads, or lets a wallet call (ZolaceVault.sol).
export const VAULT_ABI = parseAbi([
  "function months(uint32 period) view returns (bytes32 root, uint256 total, uint256 claimed)",
  "function hasClaimed(uint32 period, address account) view returns (bool)",
  "function fund(uint32 period, bytes32 root, uint256 total)",
  "function claim(uint32 period, address account, uint256 amount, bytes32[] proof)",
])

// What the owner's wallet is asked of the reward's token before a month is funded.
export const REWARD_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
])
