import { connection } from "next/server"

import { PageHead } from "@/components/site/page-shell"
import { DotLabel, PillLink } from "@/components/site/primitives"
import { XIcon, X_URL } from "@/components/site/x-link"
import { Button } from "@/components/ui/button"
import { engine } from "@/lib/payment"
import { sellerLimits, sellingOn } from "@/lib/selling"

// Whether other sellers can sell here is a setting of the server (lib/selling.ts), read when a
// page is asked for and not when the site is built. Everything on /sell that says "open" or "not
// open yet" is in this file, so switching it changes all of it at once.

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`

async function now() {
  await connection()
  return { open: sellingOn(), testnet: engine().network === "testnet", limits: sellerLimits() }
}

export async function SellHead() {
  const { open, testnet, limits } = await now()
  if (!open) {
    return (
      <PageHead
        figure="sweep"
        label="Selling / Not open yet"
        title="Your goods. Your wallet. Our shelf."
        facts={["Paid straight to the seller", "Open to anyone", "Free at the start", "Not open yet"]}
      >
        Zolace is opening its shelves to other sellers. A buyer pays you directly, in shielded ZEC, to an address that is
        yours, and the shop never holds the money. Selling is not open on this server yet: this page says how it works,
        and the walk-through below shows one order.
      </PageHead>
    )
  }
  return (
    <PageHead
      figure="sweep"
      label={testnet ? "Selling / Test network" : "Selling / Open"}
      title="Your goods. Your wallet. Our shelf."
      facts={["Paid straight to the seller", "Open to anyone", "Free at the start", `At most ${dollars(limits.maxPriceCents)} an item`]}
    >
      Zolace&apos;s shelves are open to other sellers. A buyer pays you directly, in shielded ZEC, to an address that is yours,
      and the shop never holds the money. Sign up with a viewing key, list an item and put codes behind it.
      {testnet ? " The shop runs on Zcash's test network right now: orders are paid in test coins, which are worth nothing." : ""}
    </PageHead>
  )
}

export function SellHeadFallback() {
  return (
    <PageHead figure="sweep" label="Selling" title="Your goods. Your wallet. Our shelf.">
      …
    </PageHead>
  )
}

// The card at the foot of /sell: the way in when selling is open, and what to do until it is.
export async function SellAction() {
  const { open, limits } = await now()
  if (!open) {
    return (
      <>
        <DotLabel>The first sellers</DotLabel>
        <h2 className="mt-5 max-w-md text-3xl leading-[1.03] font-medium tracking-[-0.04em] text-balance md:text-4xl">
          Tell us what you would sell.
        </h2>
        <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
          Selling is not open on this server yet. Say on X what you would put on a shelf, and nothing more about yourself
          than you want to.
        </p>
        <div className="mt-8 flex flex-wrap gap-2 lg:mt-auto lg:pt-8">
          <Button asChild size="lg">
            <a href={X_URL} target="_blank" rel="noopener noreferrer">
              <XIcon className="size-3.5" />
              Say it on X
            </a>
          </Button>
          <PillLink href="/docs/placing-an-order" variant="secondary" size="lg">
            How an order runs
          </PillLink>
        </div>
      </>
    )
  }
  return (
    <>
      <DotLabel>Start selling</DotLabel>
      <h2 className="mt-5 max-w-md text-3xl leading-[1.03] font-medium tracking-[-0.04em] text-balance md:text-4xl">
        A viewing key, a name, an item.
      </h2>
      <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
        No account and no application. You get a link that is your way back to your items: an item costs at most{" "}
        {dollars(limits.maxPriceCents)}, and a seller lists at most {limits.maxItems}.
      </p>
      <div className="mt-8 flex flex-wrap gap-2 lg:mt-auto lg:pt-8">
        <PillLink href="/sell/start" size="lg" arrow>
          Sign up as a seller
        </PillLink>
        <PillLink href="/docs/placing-an-order" variant="secondary" size="lg">
          How an order runs
        </PillLink>
      </div>
    </>
  )
}

export function SellActionFallback() {
  return (
    <>
      <DotLabel>Selling</DotLabel>
      <p className="mt-5 text-muted-foreground">…</p>
    </>
  )
}
