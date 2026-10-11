import type { ComponentType, CSSProperties } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import { BrowserIcon, ServerIcon, WalletIcon } from "@/components/site/icons"
import { Container, SectionHead } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"
import { cn } from "@/lib/utils"

// The four parties of an order, left to right, in the order that keeps every message between
// neighbours. A step names its sender and receiver by their place in this list.
const PARTIES: { name: string; holds: string; icon: ComponentType<{ className?: string }> }[] = [
  { name: "Your wallet", holds: "Your ZEC and your keys", icon: WalletIcon },
  { name: "Zcash network", holds: "A shielded payment, no sender shown", icon: ZecIcon },
  { name: "The server", holds: "A viewing key, never a spending key", icon: ServerIcon },
  { name: "Your browser", holds: "The secret half of the order link", icon: BrowserIcon },
]

const STEPS: { from: number; to: number; text: string }[] = [
  { from: 3, to: 2, text: "Check out: no name, no email" },
  { from: 2, to: 3, text: "A one-time address, price held 15 min" },
  { from: 0, to: 1, text: "You send ZEC, shielded" },
  { from: 1, to: 2, text: "Seen with the viewing key, confirmed in 3 blocks" },
  { from: 2, to: 3, text: "The item, sealed to your browser's key" },
]

const LAST = "Opened here. The server keeps a sealed copy it cannot read."

// Tailwind needs the class names spelled out, so the grid placement is looked up, not computed.
const START = ["md:col-start-1", "md:col-start-2", "md:col-start-3"]

// "Who talks to whom": a sequence diagram of one order. Each message is a track between two
// lifelines with a pulse running along it (`.flow-pulse` in app/globals.css), one after another.
export function Flow() {
  return (
    <section id="flow" className="pt-24 md:pt-32">
      <Container>
        <SectionHead index={3} label="Under the hood" title="Four parties, six messages.">
          Everything that crosses a wire during one order, and who holds what at the end of it.
        </SectionHead>

        <Reveal className="cut rounded-3xl bg-card p-4 md:p-8">
          <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {PARTIES.map((party, index) => (
              <li key={party.name} className="rounded-2xl bg-secondary p-4 md:p-5">
                <div className="flex items-center justify-between">
                  <party.icon className="size-6 text-brand" />
                  <span className="label-mono text-muted-foreground">P{index + 1}</span>
                </div>
                <p className="mt-5 font-medium tracking-[-0.02em]">{party.name}</p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{party.holds}</p>
              </li>
            ))}
          </ul>

          <div className="relative mt-2.5">
            {/* The four lifelines, one under each party. A drawing, so it is allowed its lines. */}
            <div aria-hidden className="absolute inset-0 hidden grid-cols-4 gap-2.5 md:grid">
              {PARTIES.map((party) => (
                <span key={party.name} className="mx-auto w-px bg-foreground/10" />
              ))}
            </div>

            <ol className="relative space-y-2.5 py-6 md:space-y-0 md:py-8">
              {STEPS.map((step, index) => {
                const left = Math.min(step.from, step.to)
                const reverse = step.to < step.from
                return (
                  <li key={step.text} className="md:grid md:grid-cols-4 md:gap-2.5 md:py-4">
                    <div className={cn("md:col-span-2", START[left])}>
                      {/* Between the centres of two columns: a quarter in from each side. */}
                      <div className="rounded-xl bg-secondary p-4 md:mx-[25%] md:bg-transparent md:p-0">
                        <p className="flex items-baseline gap-3 md:justify-center md:text-center">
                          <span className="label-mono shrink-0 text-brand">0{index + 1}</span>
                          <span className="text-sm leading-snug">{step.text}</span>
                        </p>
                        <p className="label-mono mt-2 text-[0.625rem] text-muted-foreground md:hidden">
                          {PARTIES[step.from].name} → {PARTIES[step.to].name}
                        </p>
                        <div
                          aria-hidden
                          className="relative mt-3 hidden h-1.5 overflow-hidden rounded-full bg-foreground/10 md:block"
                        >
                          <span
                            style={{ "--flow-delay": `${index * 0.9}s` } as CSSProperties}
                            className={cn("flow-pulse absolute inset-0", reverse && "flow-back")}
                          >
                            <span className="absolute inset-y-0 left-0 w-10 rounded-full bg-primary" />
                          </span>
                          <span
                            className={cn(
                              "absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand",
                              reverse ? "left-0" : "right-0"
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}

              <li className="md:grid md:grid-cols-4 md:gap-2.5 md:pt-4">
                <p className="flex items-baseline gap-3 rounded-xl bg-accent p-4 text-sm leading-snug md:col-start-4">
                  <span className="label-mono shrink-0 text-brand">0{STEPS.length + 1}</span>
                  {LAST}
                </p>
              </li>
            </ol>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
