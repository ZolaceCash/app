import NetworkRobinhood from "@web3icons/react/icons/networks/NetworkRobinhood"
import TokenZEC from "@web3icons/react/icons/tokens/TokenZEC"
import type { ComponentProps } from "react"

// The two marks on the site, from the web3icons set: ZEC, which an order is paid in, and
// Robinhood Chain, where the token is planned. Always the one-colour variant: a mark takes the
// colour of the text around it, so the page keeps its own palette. The chain's mark only ever
// names the network; the footer says the shop is not affiliated with Robinhood.
type IconProps = Omit<ComponentProps<typeof TokenZEC>, "variant">

export function ZecIcon(props: IconProps) {
  return <TokenZEC variant="mono" aria-hidden {...props} />
}

export function ChainIcon(props: IconProps) {
  return <NetworkRobinhood variant="mono" aria-hidden {...props} />
}
