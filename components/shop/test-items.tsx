import Link from "next/link"
import { connection } from "next/server"

import { BuyButton } from "@/components/shop/buy-button"
import { ZecIcon } from "@/components/site/chain-icons"
import { listItems, type ShelfItem } from "@/lib/orders"
import { shopWords } from "@/lib/shop-mode"

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

// What can be ordered right now, read from the database on each request.
export async function TestItems() {
  await connection()
  // What the order button says follows what the shop takes.
  const order = shopWords().order
  // Without a database the rest of the site still stands; this part says what is missing.
  let items: ShelfItem[]
  try {
    items = await listItems()
  } catch {
    return (
      <p className="cut rounded-3xl bg-card p-6 leading-relaxed text-muted-foreground">
        Test orders are switched off right now: the shop cannot reach its database. The rest of
        the site is unaffected.
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <p className="cut rounded-3xl bg-card p-6 leading-relaxed text-muted-foreground">
        Nothing is on the shelf right now.
      </p>
    )
  }

  return (
    <ul className="grid gap-2.5 md:grid-cols-3">
      {items.map((item, index) => (
        <li key={item.slug} className="flex flex-col cut rounded-3xl bg-card p-6">
          <div className="label-mono flex items-center justify-between text-muted-foreground">
            <span>0{index + 1}</span>
            <span className="rounded-md bg-accent px-2.5 py-1.5 text-accent-foreground">
              {item.kind === "test" ? "Test item" : `${item.left} left`}
            </span>
          </div>
          <h3 className="mt-8 text-2xl font-medium tracking-[-0.035em]">
            <Link
              href={`/shop/${item.slug}`}
              className="rounded outline-none transition-colors duration-200 hover:text-brand focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {item.name}
            </Link>
          </h3>
          <p className="mt-2 flex-1 leading-snug text-muted-foreground">{item.blurb}</p>
          <p className="mt-6 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-medium tracking-[-0.04em]">
              {dollars(item.priceCents)}
            </span>
            <span className="label-mono flex items-center gap-1.5 text-muted-foreground">
              <ZecIcon className="size-3.5 text-brand" />
              paid in ZEC
            </span>
          </p>
          <div className="mt-6">
            <BuyButton slug={item.slug} label={order} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function TestItemsFallback() {
  return (
    <div aria-hidden className="grid gap-2.5 md:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div key={key} className="h-72 cut rounded-3xl bg-card" />
      ))}
    </div>
  )
}
