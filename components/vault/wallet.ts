// Talking to a wallet in the browser, directly (EIP-1193). No connection service sits between
// the site and the wallet, so nobody else learns which wallet is here. Used by the two places that
// need a wallet: a holder claiming, and the owner funding a month.

export type Provider = { request: (call: { method: string; params?: unknown[] }) => Promise<unknown> }

export const provider = () => (window as unknown as { ethereum?: Provider }).ethereum

// What a wallet needs to be told to add the token's network, for the two networks there are.
const NETWORKS: Record<number, { chainName: string; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
  4663: {
    chainName: "Robinhood Chain",
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  },
  46630: {
    chainName: "Robinhood Chain Testnet",
    rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
  },
}

export async function connect(eth: Provider) {
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[]
  return (accounts[0] ?? null) as `0x${string}` | null
}

// A wallet sends a transaction on the network it is on: put it on the token's.
export async function onNetwork(eth: Provider, chainId: number) {
  const hex = `0x${chainId.toString(16)}`
  if (((await eth.request({ method: "eth_chainId" })) as string).toLowerCase() === hex) return
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] })
  } catch (error) {
    const network = NETWORKS[chainId]
    if ((error as { code?: number }).code !== 4902 || !network) throw error
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hex, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, ...network }],
    })
  }
}

export const call = (eth: Provider, to: string, data: string) =>
  eth.request({ method: "eth_call", params: [{ to, data }, "latest"] }) as Promise<`0x${string}`>

export const send = (eth: Provider, from: string, to: string, data: string) =>
  eth.request({ method: "eth_sendTransaction", params: [{ from, to, data }] }) as Promise<`0x${string}`>

// Waits until a sent transaction is in a block, and says whether it went through.
export async function mined(eth: Provider, hash: string, tries = 60) {
  for (let at = 0; at < tries; at++) {
    const receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status?: string } | null
    if (receipt) return receipt.status === "0x1"
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return false
}
