import type { Metadata } from "next";
import { Minus } from "lucide-react";

import { PageHead, PageShell } from "@/components/site/page-shell";
import { DotLabel, PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { XIcon, X_URL } from "@/components/site/x-link";
import { Button } from "@/components/ui/button";
import { DECIDED, PLAINLY, STEPS, UNDECIDED } from "@/lib/sell";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sell on Zolace",
  description:
    "The plan for other sellers on Zolace: a buyer pays the seller directly, in shielded ZEC, and the shop never holds the money. Not open yet.",
};

// The plan for other sellers (lib/sell.ts). Nothing here can be used yet, and the page says so
// first: it is how selling is meant to work, what follows from that, and what is still open.
export default function Sell() {
  return (
    <PageShell>
      <PageHead
        figure="sweep"
        label="Selling / Not open yet"
        title="Your goods. Your wallet. Our shelf."
        facts={["Paid straight to the seller", "Open to anyone", "Free at the start", "Being built"]}
      >
        Zolace is opening its shelves to other sellers. A buyer pays you directly, in shielded ZEC,
        to an address that is yours, and the shop never holds the money. None of this can be used
        today: this page says how it is meant to work and what is still to be decided.
      </PageHead>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        {DECIDED.map((item, index) => (
          <Reveal
            key={item.name}
            delay={index * 60}
            className={cn("cut rounded-3xl p-6 md:p-8", index === 0 ? "bg-primary text-primary-foreground" : "bg-card")}
          >
            <p className={cn("label-mono", index === 0 ? "text-primary-foreground/70" : "text-muted-foreground")}>
              Decided / 0{index + 1}
            </p>
            <h2 className="mt-8 text-2xl leading-[1.05] font-medium tracking-[-0.04em] text-balance md:text-3xl">
              {item.name}
            </h2>
            <p className={cn("mt-3 leading-snug", index === 0 ? "text-primary-foreground/85" : "text-muted-foreground")}>
              {item.body}
            </p>
          </Reveal>
        ))}
      </div>

      <div className="mt-2.5 grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Reveal className="cut-2 rounded-3xl bg-card p-6 md:p-8">
          <DotLabel>How an order of yours will run</DotLabel>
          <ol className="mt-6 space-y-1.5">
            {STEPS.map((step, index) => (
              <li
                key={step.name}
                className="grid gap-x-6 gap-y-1 rounded-xl bg-secondary px-5 py-5 sm:grid-cols-[3rem_13rem_1fr]"
              >
                <p className="label-mono pt-1 text-brand">0{index + 1}</p>
                <p className="text-lg font-medium tracking-[-0.03em]">{step.name}</p>
                <p className="leading-snug text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal className="cut rounded-3xl bg-ice p-6 text-ink md:p-8">
          <p className="label-mono">Said plainly</p>
          <ul className="mt-6 space-y-4 leading-snug">
            {PLAINLY.map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-ink/10">
                  <Minus aria-hidden className="size-3" />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
        <Reveal className="cut rounded-3xl bg-card p-6 md:p-8">
          <DotLabel>Not decided yet</DotLabel>
          <ul className="mt-6 space-y-1.5">
            {UNDECIDED.map((line) => (
              <li key={line} className="rounded-lg bg-secondary px-5 py-3.5 leading-snug text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={60} className="cut flex flex-col rounded-3xl bg-card p-6 md:p-8">
          <DotLabel>The first sellers</DotLabel>
          <h2 className="mt-5 max-w-md text-3xl leading-[1.03] font-medium tracking-[-0.04em] text-balance md:text-4xl">
            Tell us what you would sell.
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            Selling is not open yet. What sellers ask for decides what is built first: say on X what you
            would put on a shelf, and nothing more about yourself than you want to.
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
        </Reveal>
      </div>
    </PageShell>
  );
}
