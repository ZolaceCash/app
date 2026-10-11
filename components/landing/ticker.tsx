import type { ComponentType } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import {
  BlockIcon,
  KeyIcon,
  NoAccountIcon,
  NoTrackingIcon,
  PriceLockIcon,
  SealIcon,
  TokenIcon,
} from "@/components/site/icons"
import { Container } from "@/components/site/primitives"

const ITEMS: { icon: ComponentType<{ className?: string }>; text: string }[] = [
  { icon: ZecIcon, text: "Paid in shielded ZEC" },
  { icon: NoAccountIcon, text: "No account" },
  { icon: PriceLockIcon, text: "15 minute price lock" },
  { icon: BlockIcon, text: "3 block confirmation" },
  { icon: SealIcon, text: "Sealed in your browser" },
  { icon: KeyIcon, text: "Viewing key only" },
  { icon: NoTrackingIcon, text: "No analytics" },
  { icon: TokenIcon, text: "Token on Robinhood Chain, later" },
]

// One line of facts that drifts past (`.ticker` in app/globals.css). The list is laid out twice so
// the loop has no seam; the second copy is hidden from assistive tech. It rests under the pointer,
// and with reduced motion it does not travel at all.
export function Ticker() {
  return (
    <Container className="pt-2.5">
      <div className="ticker overflow-hidden cut rounded-3xl bg-card py-4">
        <div className="ticker-track flex w-max">
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0">
              {ITEMS.map((item) => (
                <li key={item.text} className="label-mono flex items-center gap-2.5 px-6">
                  <item.icon className="size-4 shrink-0 text-brand" />
                  {item.text}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </Container>
  )
}
