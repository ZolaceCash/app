import { connection } from "next/server"

import { itemsNow } from "@/components/shop/items-now"
import { DotLabel } from "@/components/site/primitives"
import { ShelfGrid, type OnSale } from "@/components/site/shelf-grid"

// Which shelves have something on them right now: how many items, and the lowest price. An item
// counts while it can be ordered, so a shelf whose last code is gone reads as planned again.
async function onSaleNow(): Promise<OnSale> {
  await connection()
  const onSale: OnSale = {}
  try {
    for (const item of await itemsNow()) {
      if (!item.shelf || item.left === 0) continue
      const shelf = onSale[item.shelf]
      onSale[item.shelf] = {
        items: (shelf?.items ?? 0) + 1,
        fromCents: Math.min(shelf?.fromCents ?? Infinity, item.priceCents),
      }
    }
  } catch {
    // Without a database the shelves are drawn as planned: nothing is claimed to be on sale.
  }
  return onSale
}

// The shelves with what is on sale marked on them, for a page that draws the plain grid first.
export async function LiveShelfGrid({ className }: { className?: string }) {
  return <ShelfGrid className={className} onSale={await onSaleNow()} />
}

const HOW_MANY = ["none", "one", "two", "three", "four", "five"]

function Section({ title, onSale, children }: { title: string; onSale?: OnSale; children: React.ReactNode }) {
  return (
    <>
      <div className="px-3 pt-24 pb-10 md:px-4">
        <DotLabel>The shelves</DotLabel>
        <h2 className="mt-5 max-w-xl text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-5xl">
          {title}
        </h2>
        <p className="mt-6 max-w-xl leading-relaxed text-pretty text-muted-foreground">{children}</p>
      </div>
      <ShelfGrid onSale={onSale} />
    </>
  )
}

// The shelves on the shop's page, under a heading that counts the ones with something on them.
export async function ShopShelves() {
  const onSale = await onSaleNow()
  const stocked = Object.keys(onSale).length
  if (stocked === 0) {
    return (
      <Section title="Six shelves, none stocked yet.">
        A shelf has no prices until its first item is in stock. The filled shelves are meant to open
        first; the dark ones are planned.
      </Section>
    )
  }
  return (
    <Section title={stocked >= 6 ? "Six shelves, all stocked." : `Six shelves, ${HOW_MANY[stocked]} stocked.`} onSale={onSale}>
      A shelf opens when its first item is in stock, and is marked on sale while one is left. The
      others are planned and have no prices yet.
    </Section>
  )
}

// Until the stock is known the heading counts nothing.
export function ShopShelvesFallback() {
  return <Section title="Six shelves.">…</Section>
}
