import { aboutZec, formatZec, toZat } from "@/lib/price"

// "Try selling": a walk-through of one order of a seller's item, on /sell.
//
// Selling is not built (PLAN.md, "Other sellers"). Until it is, a visitor can type a pretend
// item and watch one order of it run: where the payment goes, what the shop holds, what the
// buyer opens. All of it happens in the browser. Nothing typed is sent anywhere, nothing is
// listed, no key is asked for and no money moves; the page says so above the form.
//
// This file is the part with no browser in it: what counts as a pretend item, the steps an
// order walks through, and the sums at the end.

export type Pretend = { name: string; priceCents: number; code: string }
export type Field = "name" | "price" | "code"
export type Asked = { ok: true; item: Pretend } | { ok: false; field: Field }

export const NAME_MOST = 60
export const CODE_MOST = 40

// A pretend item from what was typed. The price is dollars with at most two places, more than
// nothing and under ten thousand: wide enough for a walk-through, and no rule of the shop's.
export function pretendItem(name: string, price: string, code: string): Asked {
  const named = name.trim().replace(/\s+/g, " ")
  if (named.length < 1 || named.length > NAME_MOST) return { ok: false, field: "name" }
  const written = price.trim().replace(/^\$/, "")
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(written)) return { ok: false, field: "price" }
  const priceCents = Math.round(Number(written) * 100)
  if (priceCents < 1) return { ok: false, field: "price" }
  const handed = code.trim()
  if (handed.length < 1 || handed.length > CODE_MOST) return { ok: false, field: "code" }
  return { ok: true, item: { name: named, priceCents, code: handed } }
}

// The steps of the order, in the order they happen. `blocks` is the one that takes three turns.
export const STEPS = [
  { id: "shelf", name: "On the shelf" },
  { id: "address", name: "An address from your key" },
  { id: "paid", name: "The buyer pays you" },
  { id: "blocks", name: "Three blocks deep" },
  { id: "opened", name: "The item opens" },
] as const
export const BLOCKS = 3
// How many turns the whole walk takes: one per step, and the blocks one each.
export const TURNS = STEPS.length - 1 + BLOCKS

// Where the walk stands after a number of turns: which step is current, how many are done, and
// how many blocks have passed.
export function walk(turn: number) {
  const at = Math.max(0, Math.min(turn, TURNS))
  const before = STEPS.findIndex((step) => step.id === "blocks")
  if (at <= before) return { step: at, blocks: 0, done: at >= TURNS }
  if (at < before + BLOCKS) return { step: before, blocks: at - before, done: false }
  return { step: Math.min(before + 1 + (at - before - BLOCKS), STEPS.length - 1), blocks: BLOCKS, done: at >= TURNS }
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

// The sums of the pretend order at a rate, or without one. The seller receives the whole
// amount: the shop holds nothing and, at the start, takes nothing.
export function sums(priceCents: number, usdPerZec: number | null) {
  if (!usdPerZec || usdPerZec <= 0) return { about: null, exact: null }
  return { about: aboutZec(priceCents, usdPerZec), exact: formatZec(toZat(priceCents, usdPerZec)) }
}
