// The token, its reward and its vault, as the server is told about them. There is no token yet
// (CONTRACT.md), so by default there is no address and everything that depends on one is switched
// off: the site shows the address as unavailable, and the vault has nothing to claim. The owner
// switches it on by setting TOKEN_ADDRESS and VAULT_ADDRESS where the server runs, once the
// contracts are deployed.
//
// Read at request time, not at build time: the same build serves before and after the launch.

// A wallet has to hold this many tokens through a whole hour to earn that hour. It is also one
// lot: twice as many earns twice as much. The owner's number (11 Oct 2026).
export const MINIMUM_TOKENS = 3_000_000n
export const TOKEN_DECIMALS = 18
export const MINIMUM_UNITS = MINIMUM_TOKENS * 10n ** BigInt(TOKEN_DECIMALS)

// What one lot earns in an hour at the most, in dollar cents: 0.01 USD for every 3,000,000
// tokens held. The owner's number (12 Oct 2026), and a ceiling, not a promise: an hour pays less
// when the vault holds less. The vault's contract carries it as a rate in the reward's own units,
// which the owner sets from a price.
export const HOURLY_CENTS = 1n

// What holders are paid in: the NVDA stock token on Robinhood Chain, as the owner named it
// (11 Oct 2026), written the way an asset on a chain is written (CAIP-19). The name and the
// address were read back from the chain that day: "NVIDIA • Robinhood Token", NVDA, 18 decimals.
export const DEFAULT_REWARD_ASSET = "eip155:4663/erc20:0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec"

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ASSET = /^(?:0x)?eip155:(\d+)\/erc20:(0x[0-9a-fA-F]{40})$/

export type Reward = { address: `0x${string}`; symbol: string; decimals: number }

export type TokenConfig = {
  // Null while the token is not live.
  address: `0x${string}` | null
  chainId: number
  rpcUrl: string
  // The block the token's contract was deployed in. Transfers are read from here on.
  deployBlock: bigint
  // The vault's contract. Null until it is deployed.
  vault: `0x${string}` | null
  // Null when the reward asset is not on the token's network: the two have to be on one chain.
  reward: Reward | null
  // Addresses that never earn, as the owner names them (VAULT_SKIP): contracts that hold the
  // token and could never claim, such as the pool it trades in.
  skip: `0x${string}`[]
}

const address = (value: string | undefined) => {
  const text = (value ?? "").trim()
  return ADDRESS.test(text) ? (text as `0x${string}`) : null
}

// An asset as "eip155:<chain>/erc20:<address>". A stray "0x" in front is forgiven.
export function parseAsset(text: string): { chainId: number; address: `0x${string}` } | null {
  const match = ASSET.exec(text.trim())
  return match ? { chainId: Number(match[1]), address: match[2] as `0x${string}` } : null
}

export function tokenConfig(): TokenConfig {
  const chain = Number(process.env.TOKEN_CHAIN_ID ?? "")
  // Robinhood Chain mainnet, unless told otherwise (46630 is its testnet).
  const chainId = Number.isSafeInteger(chain) && chain > 0 ? chain : 4663
  const deployBlock = (process.env.TOKEN_DEPLOY_BLOCK ?? "").trim()
  const asset = parseAsset((process.env.REWARD_ASSET ?? "").trim() || DEFAULT_REWARD_ASSET)
  const decimals = Number(process.env.REWARD_DECIMALS ?? "")

  return {
    address: address(process.env.TOKEN_ADDRESS),
    chainId,
    rpcUrl: (process.env.TOKEN_RPC_URL ?? "").trim() || "https://rpc.mainnet.chain.robinhood.com",
    deployBlock: /^\d+$/.test(deployBlock) ? BigInt(deployBlock) : 0n,
    vault: address(process.env.VAULT_ADDRESS),
    skip: (process.env.VAULT_SKIP ?? "")
      .split(/[\s,;]+/)
      .filter((word) => ADDRESS.test(word))
      .map((word) => word.toLowerCase() as `0x${string}`),
    reward:
      asset && asset.chainId === chainId
        ? {
            address: asset.address,
            symbol: (process.env.REWARD_SYMBOL ?? "").trim() || "NVDA",
            decimals: Number.isSafeInteger(decimals) && decimals > 0 && decimals <= 36 ? decimals : 18,
          }
        : null,
  }
}

// The vault is open when all three are known: the token, the vault and the reward.
export function vaultLive(config: TokenConfig): config is TokenConfig & {
  address: `0x${string}`
  vault: `0x${string}`
  reward: Reward
} {
  return config.address !== null && config.vault !== null && config.reward !== null
}

// The network by the name people know it by.
export const chainName = (chainId: number) =>
  chainId === 4663 ? "Robinhood Chain" : chainId === 46630 ? "Robinhood Chain testnet" : `network ${chainId}`

// Where anyone can look an address up, on the two networks that have a public explorer.
const EXPLORERS: Record<number, string> = {
  4663: "https://robinhoodchain.blockscout.com",
  46630: "https://explorer.testnet.chain.robinhood.com",
}
export const explorerUrl = (chainId: number, address: string) =>
  EXPLORERS[chainId] ? `${EXPLORERS[chainId]}/address/${address}` : null

// What the site says about the token today, in each of its two states. Every page that speaks of
// the token's state takes it from here (components/site/token-status.tsx), so setting or clearing
// TOKEN_ADDRESS changes all of them at once and none is left saying the opposite.
//
// `closedAfter` is the last hour that earned, once the owner has closed the reward (the vault's
// own records have it, lib/vault-store.ts).
export function tokenStatement(config: TokenConfig, closedAfter: number | null = null) {
  if (!config.address) {
    return "There is no token today and no contract address. No audit and no legal review has been done. Anything offered under this name today is not from this project."
  }
  const reward = !vaultLive(config)
    ? "The reward for its holders is not open: the vault's contract is not deployed."
    : closedAfter === null
      ? "The vault that pays its holders is open."
      : `The reward for its holders is closed: no hour after ${new Date((closedAfter + 1) * 3_600_000).toISOString().slice(0, 16).replace("T", " ")} UTC earns, and what had not been claimed by then went back to the owner.`
  return `The token is on ${chainName(config.chainId)}, at the address below. Its contract has not been audited and no legal review has been done. A token with this name at any other address is not this project's. ${reward} Nothing here is an offer.`
}

// A whole number of smallest units as an amount for people: "3,000,000" or "12.5".
export function formatUnitsShort(units: bigint, decimals: number, places = 6) {
  const base = 10n ** BigInt(decimals)
  const whole = (units / base).toLocaleString("en-US")
  const rest = (units % base).toString().padStart(decimals, "0").slice(0, places).replace(/0+$/, "")
  return rest ? `${whole}.${rest}` : whole
}

export const formatTokens = (units: bigint) => formatUnitsShort(units, TOKEN_DECIMALS, 2)

// An amount as the owner types it ("12.5") in smallest units, or null when it is not one.
// Worked out from the digits, not through a fraction, so it is exact.
export function parseUnitsExact(text: string, decimals: number) {
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(text.trim())
  if (!match || (match[2] ?? "").length > decimals) return null
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? "").padEnd(decimals, "0") || "0")
}
