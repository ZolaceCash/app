"use client"

import { useEffect, useState } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import { aboutZec, type Rate } from "@/lib/price"

// On an item's page: about what the price is in ZEC at this moment. The price is set in dollars
// and only becomes an exact amount of ZEC when an order is placed, so this is for knowing how
// much to have ready. It asks the shop for the rate (app/api/price), again every half minute
// while the page is in front; the request is the same whatever item is being read. Without a
// rate it says only how the item is paid, as the page did before.
const AGAIN_MS = 30_000

export function ZecNow({ priceCents }: { priceCents: number }) {
  const [rate, setRate] = useState<Rate | null>(null)

  useEffect(() => {
    let gone = false
    async function ask() {
      if (document.visibilityState !== "visible") return
      try {
        const response = await fetch("/api/price", { cache: "no-store" })
        const answer = (await response.json()) as Rate
        if (!gone) setRate(answer)
      } catch {
        // No answer: what was shown stays, and the next turn asks again.
      }
    }
    void ask()
    const timer = window.setInterval(ask, AGAIN_MS)
    document.addEventListener("visibilitychange", ask)
    return () => {
      gone = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", ask)
    }
  }, [])

  if (!rate?.ok) {
    return (
      <span className="label-mono flex items-center gap-1.5 text-muted-foreground">
        <ZecIcon className="size-3.5 text-brand" />
        paid in ZEC
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-1.5">
      <span className="label-mono flex items-center gap-1.5 text-foreground" aria-live="polite">
        <ZecIcon className="size-3.5 text-brand" />
        about {aboutZec(priceCents, rate.usdPerZec)} ZEC now
      </span>
      <span className="label-mono text-muted-foreground">1 ZEC is about ${rate.usdPerZec.toFixed(2)}</span>
    </span>
  )
}
