import { connection } from "next/server"
import { Suspense } from "react"

import { shopWords, type ShopWords } from "@/lib/shop-mode"

// What the shop takes right now, said in one place (lib/shop-mode.ts) and read when a page is
// asked for, not when the site is built: switching payments on where the server runs changes
// every page that speaks of it.

type Part = { [K in keyof ShopWords]: ShopWords[K] extends string ? K : never }[keyof ShopWords]

async function Current({ part }: { part: Part }) {
  await connection()
  return <>{shopWords()[part]}</>
}

// One of the shop's phrases, as text. Until the answer is there it says nothing: a page must not
// say "test orders only" for a moment, or to a reader without scripts, when that is not so.
export function ShopWord({ part }: { part: Part }) {
  return (
    <Suspense fallback="…">
      <Current part={part} />
    </Suspense>
  )
}

async function CurrentBox() {
  await connection()
  return (
    <p className="rounded-xl bg-accent p-5 leading-relaxed text-accent-foreground">
      <span className="label-mono mb-2 block">Today</span>
      <span className="text-foreground/85">{shopWords().today}</span>
    </p>
  )
}

// The same, as the set-apart box the long pages use.
export function ShopToday() {
  return (
    <Suspense fallback={<div aria-busy className="h-28 rounded-xl bg-accent" />}>
      <CurrentBox />
    </Suspense>
  )
}
