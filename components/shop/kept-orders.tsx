"use client"

import { ArrowUpRight } from "lucide-react"

import { forget, forgetAll, useKept } from "@/components/shop/kept-store"
import { PillLink } from "@/components/site/primitives"
import { Button } from "@/components/ui/button"
import { keptHref, type Kept } from "@/lib/kept"

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
const day = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`

// The orders this browser keeps. All of it is read from the browser's own storage: the server is
// not asked about any of them, so it cannot tell that they belong to one buyer.
export function KeptOrders() {
  const list = useKept()

  // A plain page load, as at checkout: the browser itself drops the part after # before it asks
  // the server for the page.
  const open = (order: Kept) => window.location.assign(keptHref(order))

  if (list.length === 0) {
    return (
      <div className="cut rounded-3xl bg-card p-7 md:p-10">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">Nothing is kept on this device.</h2>
        <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
          An order is kept here only when you press &ldquo;Keep on this device&rdquo; on its page. Until then its
          link is the only way back to it.
        </p>
        <PillLink href="/shop" arrow className="mt-8">
          Go to the shop
        </PillLink>
      </div>
    )
  }

  return (
    <div className="cut rounded-3xl bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">
          {list.length} order{list.length === 1 ? "" : "s"} kept here
        </h2>
        <Button variant="outline" onClick={forgetAll}>
          Forget all of them
        </Button>
      </div>

      <ul className="mt-6 space-y-1.5">
        {list.map((order) => (
          <li
            key={order.id}
            className="grid items-center gap-x-6 gap-y-3 rounded-lg bg-secondary px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div>
              <p className="font-medium tracking-[-0.02em]">{order.item}</p>
              <p className="label-mono mt-2 text-muted-foreground">
                {dollars(order.priceCents)} · order {order.id.slice(0, 8)} · kept {day(order.keptAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => open(order)}>
                Open the order
                <ArrowUpRight aria-hidden />
              </Button>
              <Button variant="outline" onClick={() => forget(order.id)}>
                Forget
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
