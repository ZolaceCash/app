import type { ComponentType, CSSProperties } from "react"

import { HeroDeck } from "@/components/landing/hero-deck"
import { ZecIcon } from "@/components/site/chain-icons"
import { TokenAddress } from "@/components/site/token-address"
import { KeyIcon, NoAccountIcon, PriceLockIcon } from "@/components/site/icons"
import { Container, PillLink } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"

const FACTS: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: NoAccountIcon, title: "No account", body: "Checkout never asks who you are." },
  { icon: ZecIcon, title: "Shielded ZEC", body: "One address, made for one order." },
  { icon: PriceLockIcon, title: "15 minute lock", body: "The price in ZEC is held while you pay." },
  { icon: KeyIcon, title: "Viewing key only", body: "The server sees a payment. It cannot spend." },
]

export function Hero() {
  return (
    <section className="pt-20">
      <Container>
        {/* The stage sits straight on the page, with no box: the deck in the middle, the headline
            split around it. On a wide screen it runs to the bottom of the screen (the 5rem is the
            room kept for the nav above it), and the deck's `--stage-h` in app/globals.css is the
            same height. */}
        <div className="relative isolate flex flex-col lg:block lg:h-[max(34rem,calc(100svh-5rem))]">
          <h1 className="relative z-10 px-3 pt-8 pb-2 text-[clamp(2.5rem,11vw,3.5rem)] leading-[0.98] font-medium tracking-[-0.04em] lg:static lg:p-0 lg:text-[clamp(2.25rem,3.3vw,4rem)]">
            <span className="enter block lg:absolute lg:top-1/2 lg:left-4 lg:z-10 lg:-translate-y-1/2">
              Pay shielded.
            </span>{" "}
            <span
              style={{ "--enter-delay": "140ms" } as CSSProperties}
              className="enter block lg:absolute lg:top-1/2 lg:right-4 lg:z-10 lg:-translate-y-1/2"
            >
              Get the goods.
            </span>
          </h1>

          <HeroDeck />

          {/* On a wide screen this block keeps to the left of the open card: half the stage, less
              half the card's width (`--card-w` in app/globals.css) and a gap. */}
          <div
            style={{ "--enter-delay": "300ms" } as CSSProperties}
            className="enter relative z-20 flex flex-col items-start gap-4 px-3 pb-10 lg:absolute lg:bottom-8 lg:left-4 lg:max-w-[min(24rem,calc(50%-max(12.25rem,min(16vw,18rem))-2rem))] lg:p-0"
          >
            <p className="label-mono inline-flex items-center gap-2.5 rounded-md bg-secondary py-2 pr-3.5 pl-3">
              <span aria-hidden className="live-dot size-1.5 shrink-0 rounded-full bg-signal" />
              Preview: test orders only, no real payments
            </p>
            <p className="max-w-[19rem] leading-snug tracking-[-0.01em] text-pretty text-muted-foreground">
              A shop for digital goods that needs no account. Priced in dollars, paid in shielded
              ZEC.
            </p>
            <div className="flex flex-wrap gap-2">
              <PillLink href="/shop" arrow>
                Try a test order
              </PillLink>
              <PillLink href="#how" variant="secondary">
                How it works
              </PillLink>
            </div>
            <TokenAddress />
          </div>
        </div>

        <ul className="mt-2.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {FACTS.map((fact, index) => (
            <li key={fact.title}>
              <Reveal delay={index * 70} className="group h-full cut rounded-3xl bg-card p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <fact.icon className="size-7 text-brand transition-transform duration-500 ease-out group-hover:scale-110" />
                  <span className="label-mono text-muted-foreground">0{index + 1}</span>
                </div>
                <p className="mt-8 text-lg font-medium tracking-[-0.03em]">{fact.title}</p>
                <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{fact.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
