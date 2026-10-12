"use client"

import { Check } from "lucide-react"
import { useEffect, useState } from "react"

import { DotLabel } from "@/components/site/primitives"
import { Button } from "@/components/ui/button"
import type { Rate } from "@/lib/price"
import { BLOCKS, CODE_MOST, dollars, NAME_MOST, pretendItem, STEPS, sums, TURNS, walk, type Field, type Pretend } from "@/lib/sell-try"
import { cn } from "@/lib/utils"

// On /sell: a visitor types a pretend item and watches one order of it run (lib/sell-try.ts).
// It is a walk-through. What is typed stays in this component: the one request made here asks
// the shop for the ZEC rate and carries nothing of it. Nothing is listed and no money moves.

const TURN_MS = 850
const WRONG: Record<Field, string> = {
  name: `A name, up to ${NAME_MOST} characters.`,
  price: "A price in dollars, like 12.00.",
  code: `Something to hand over, up to ${CODE_MOST} characters.`,
}
const FIELD = "mt-2 w-full rounded-lg bg-secondary px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"

export function TrySelling() {
  const [name, setName] = useState("Game key")
  const [price, setPrice] = useState("12.00")
  const [code, setCode] = useState("ABCD-EFGH-JKLM")
  const [wrong, setWrong] = useState<Field | null>(null)
  const [item, setItem] = useState<Pretend | null>(null)
  const [turn, setTurn] = useState(0)
  const [rate, setRate] = useState<Rate | null>(null)

  // The rate, asked once: the same request an item's page makes, with nothing of the form in it.
  useEffect(() => {
    let gone = false
    fetch("/api/price", { cache: "no-store" })
      .then((response) => response.json())
      .then((answer: Rate) => {
        if (!gone) setRate(answer)
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [])

  // One turn at a time, until the walk is over.
  useEffect(() => {
    if (!item || turn >= TURNS) return
    const timer = window.setTimeout(() => setTurn((now) => now + 1), TURN_MS)
    return () => window.clearTimeout(timer)
  }, [item, turn])

  function run(event: React.FormEvent) {
    event.preventDefault()
    const asked = pretendItem(name, price, code)
    if (!asked.ok) {
      setWrong(asked.field)
      setItem(null)
      return
    }
    setWrong(null)
    setItem(asked.item)
    setTurn(0)
  }

  const at = walk(turn)
  const sum = item ? sums(item.priceCents, rate?.ok ? rate.usdPerZec : null) : null
  const amount = sum?.exact ? `${sum.exact} ZEC` : "the price, in ZEC"
  const says: Record<(typeof STEPS)[number]["id"], string> = item
    ? {
        shelf: `${item.name}, ${dollars(item.priceCents)}${sum?.about ? `: about ${sum.about} ZEC now` : ", paid in ZEC"}. The page says a seller sells it.`,
        address: "One shielded address, for this order only. The shop can watch it. It cannot spend from it.",
        paid: `${sum?.exact ? `${sum.exact} ZEC` : "The price in ZEC"} leaves the buyer's wallet for yours. It does not stop at the shop.`,
        blocks: `${at.blocks} of ${BLOCKS} blocks. The ZEC has been in your wallet since the first.`,
        opened: "Sealed to the buyer's browser and opened there. The shop forgets the readable copy.",
      }
    : { shelf: "", address: "", paid: "", blocks: "", opened: "" }

  return (
    <div id="try" className="cut-2 scroll-mt-28 rounded-3xl bg-card p-6 md:p-8">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <DotLabel>Try it / In your browser only</DotLabel>
          <h2 className="mt-5 text-3xl leading-[1.03] font-medium tracking-[-0.04em] text-balance md:text-4xl">
            List a pretend item.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            A walk-through of one order. Nothing you type leaves this page, nothing is listed, no key is
            asked for and no money moves.
          </p>

          <form onSubmit={run} className="mt-6">
            <label className="block">
              <span className="label-mono text-muted-foreground">The item</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={NAME_MOST}
                autoComplete="off"
                className={FIELD}
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_1fr]">
              <label className="block">
                <span className="label-mono text-muted-foreground">Price, in dollars</span>
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className={cn(FIELD, "font-mono")}
                />
              </label>
              <label className="block">
                <span className="label-mono text-muted-foreground">What you would hand over</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={CODE_MOST}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  className={cn(FIELD, "font-mono")}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button type="submit" size="lg">
                {item ? "Run it again" : "Run a pretend order"}
              </Button>
              <p aria-live="polite" className="text-sm leading-snug text-destructive">
                {wrong ? WRONG[wrong] : null}
              </p>
            </div>
            <p className="mt-4 text-sm leading-snug text-muted-foreground">
              Do not type a real code: this is only a walk-through, and selling is not open yet.
            </p>
          </form>
        </div>

        <div>
          <ol className="space-y-1.5" aria-live="polite">
            {STEPS.map((step, index) => {
              const done = item !== null && (at.step > index || at.done)
              const current = item !== null && !at.done && at.step === index
              return (
                <li
                  key={step.id}
                  className={cn(
                    "rounded-xl px-5 py-4 transition-colors duration-500",
                    current ? "bg-accent" : "bg-secondary"
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center gap-3 font-medium transition-colors duration-500",
                      !done && !current && "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[0.625rem] transition-colors duration-500",
                        current
                          ? "bg-primary text-primary-foreground"
                          : done
                            ? "bg-foreground text-background"
                            : "bg-foreground/10 text-muted-foreground"
                      )}
                    >
                      {done ? <Check aria-hidden className="size-3.5" /> : index + 1}
                    </span>
                    {step.name}
                  </p>
                  {done || current ? (
                    <p className="mt-2 pl-9 text-sm leading-snug text-muted-foreground">{says[step.id]}</p>
                  ) : null}
                  {step.id === "opened" && done && item ? (
                    <p className="mt-3 ml-9 rounded-lg bg-ice px-4 py-3 text-center font-mono text-sm break-all text-ink">
                      {item.code}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>

          <dl className="mt-2.5 grid gap-1.5 sm:grid-cols-3">
            {(
              [
                ["Your wallet", item && at.step >= 2 ? `+ ${amount}` : "Nothing yet", item !== null && at.step >= 2],
                ["Held by Zolace", "0 ZEC", false],
                ["Taken by Zolace", "Nothing, at the start", false],
              ] as const
            ).map(([label, value, lit]) => (
              <div
                key={label}
                className={cn("rounded-xl px-5 py-4 transition-colors duration-500", lit ? "bg-primary text-primary-foreground" : "bg-secondary")}
              >
                <dt className={cn("label-mono", lit ? "text-primary-foreground/70" : "text-muted-foreground")}>{label}</dt>
                <dd className="mt-2 font-mono text-sm wrap-anywhere">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm leading-snug text-muted-foreground">
            {item && at.done
              ? "That was a walk-through. In a real order the shop could not refund for you: the money would be yours from the first block."
              : "Each step is what a real order of a seller's item is meant to do. The amounts use the rate of this moment."}
          </p>
        </div>
      </div>
    </div>
  )
}
