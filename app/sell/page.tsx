import type { Metadata } from "next";
import { Minus } from "lucide-react";
import { Suspense } from "react";

import { SellAction, SellActionFallback, SellHead, SellHeadFallback } from "@/components/sell/selling-now";
import { TrySelling } from "@/components/sell/try-selling";
import { PageShell } from "@/components/site/page-shell";
import { DotLabel } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { DECIDED, NOT_SOLD, PLAINLY, STEPS, TAKEN_DOWN, UNDECIDED } from "@/lib/sell";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sell on Zolace",
  description:
    "Other sellers on Zolace: a buyer pays the seller directly, in shielded ZEC, and the shop never holds the money.",
};

// Other sellers (lib/sell.ts): how selling works, what follows from that and what may not be
// sold. Whether it is open is a setting of the server, so the head and the last card are read on
// each request (components/sell/selling-now.tsx) and nothing else on the page claims either.
export default function Sell() {
  return (
    <PageShell>
      <Suspense fallback={<SellHeadFallback />}>
        <SellHead />
      </Suspense>

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

      <div className="mt-2.5">
        <TrySelling />
      </div>

      <div className="mt-2.5 grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Reveal className="cut-2 rounded-3xl bg-card p-6 md:p-8">
          <DotLabel>How an order of yours runs</DotLabel>
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
          <DotLabel>Not sold here</DotLabel>
          <ul className="mt-6 space-y-1.5">
            {NOT_SOLD.map((line) => (
              <li key={line} className="rounded-lg bg-secondary px-5 py-3.5 leading-snug">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 leading-snug text-muted-foreground">{TAKEN_DOWN}</p>
          <p className="label-mono mt-8 text-muted-foreground">Not decided yet</p>
          <ul className="mt-4 space-y-1.5">
            {UNDECIDED.map((line) => (
              <li key={line} className="rounded-lg bg-secondary px-5 py-3.5 leading-snug text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={60} className="cut flex flex-col rounded-3xl bg-card p-6 md:p-8">
          <Suspense fallback={<SellActionFallback />}>
            <SellAction />
          </Suspense>
        </Reveal>
      </div>
    </PageShell>
  );
}
