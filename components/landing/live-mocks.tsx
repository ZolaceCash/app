"use client"

import { Check } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useInView } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"

const LOCK_SECONDS = 15 * 60

// The price lock on the sample order, counting down so the drawing reads as a live page.
// It starts over when it runs out: this is an illustration, not a timer for anything.
export function Countdown() {
  const [left, setLeft] = useState(LOCK_SECONDS - 28)

  useEffect(() => {
    const id = window.setInterval(() => setLeft((s) => (s > 1 ? s - 1 : LOCK_SECONDS)), 1000)
    return () => window.clearInterval(id)
  }, [])

  const minutes = String(Math.floor(left / 60)).padStart(2, "0")
  const seconds = String(left % 60).padStart(2, "0")
  return (
    <span className="tabular-nums">
      {minutes}:{seconds}
    </span>
  )
}

const ROWS = ["Waiting", "Seen", "Confirmed", "Delivered"]

// One sample order from the address being shown to the item being handed over: which row is the
// current one, what the heading says, and the note on each row at that moment.
const FRAMES = [
  { at: 0, title: "Waiting for your payment", notes: ["Address shown", "", "", ""] },
  { at: 1, title: "Payment seen", notes: ["Paid", "On the network", "", ""] },
  { at: 2, title: "Confirming your payment", notes: ["Paid", "Seen", "1 of 3 blocks", ""] },
  { at: 2, title: "Confirming your payment", notes: ["Paid", "Seen", "2 of 3 blocks", ""] },
  { at: 2, title: "Confirming your payment", notes: ["Paid", "Seen", "3 of 3 blocks", ""] },
  { at: 4, title: "Delivered", notes: ["Paid", "Seen", "3 blocks", "Item opens here"] },
  { at: 4, title: "Delivered", notes: ["Paid", "Seen", "3 blocks", "Item opens here"] },
]
const FRAME_MS = 1500

// The status rows of the sample order, stepping through an order's life while they are on screen.
export function StatusRun() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const [index, setIndex] = useState(3)

  useEffect(() => {
    if (!inView) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % FRAMES.length), FRAME_MS)
    return () => window.clearInterval(id)
  }, [inView])

  const frame = FRAMES[index]

  return (
    <div ref={ref}>
      <p className="mt-4 text-xl font-medium tracking-[-0.03em]">{frame.title}</p>
      <div className="mt-5 space-y-1.5">
        {ROWS.map((row, i) => {
          const done = i < frame.at
          const current = i === frame.at
          return (
            <div
              key={row}
              className={cn(
                "flex items-center justify-between rounded-lg py-2.5 pr-4 pl-2.5 transition-colors duration-500",
                current ? "bg-accent" : "bg-background/60"
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-3 text-sm font-medium transition-colors duration-500",
                  !done && !current && "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-md font-mono text-[0.5625rem] transition-colors duration-500",
                    current
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-foreground text-background"
                        : "bg-foreground/10 text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {row}
              </span>
              <span className={cn("label-mono", current ? "text-brand" : "text-muted-foreground")}>
                {frame.notes[i]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
