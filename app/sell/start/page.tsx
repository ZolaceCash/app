import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { JoinForm } from "@/components/sell/join-form";
import { PageShell } from "@/components/site/page-shell";
import { DotLabel, PillLink } from "@/components/site/primitives";
import { engine } from "@/lib/payment";
import { NOT_SOLD, PLAINLY, TAKEN_DOWN } from "@/lib/sell";
import { sellerLimits, sellingOn } from "@/lib/selling";

export const metadata: Metadata = {
  title: "Sign up as a seller",
  description: "Sign up to sell on Zolace: a name, the viewing key of a wallet made for selling, and no account.",
  referrer: "no-referrer",
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

// Whether anyone can sign up is read on each request (lib/selling.ts). Where selling is not open
// the page says so and shows no form.
async function Start() {
  await connection();
  const network = engine().network;
  if (!sellingOn() || network === "stand-in") {
    return (
      <div className="enter cut-2 rounded-3xl bg-card p-7 md:p-12">
        <DotLabel>Selling / Not open yet</DotLabel>
        <h1 className="mt-5 max-w-2xl text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">
          Nobody can sign up here yet.
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-pretty text-muted-foreground">
          Selling is not open on this server. The page about selling says how it works and lets you walk one order
          through.
        </p>
        <div className="mt-8">
          <PillLink href="/sell" variant="secondary" arrow>
            How selling works
          </PillLink>
        </div>
      </div>
    );
  }

  const limits = sellerLimits();
  return (
    <div className="enter grid items-start gap-2.5 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="cut-2 rounded-3xl bg-card p-7 md:p-12">
        <DotLabel>
          <span className="text-muted-foreground">Selling /</span>
          {network === "testnet" ? "Test network" : "Sign up"}
        </DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">
          Sign up as a seller.
        </h1>
        <p className="mt-6 mb-8 max-w-xl leading-relaxed text-pretty text-muted-foreground">
          No account and no email. You give a name and a viewing key, and get a link that is your way back to your
          items.
          {network === "testnet" ? " The shop runs on Zcash's test network right now: use a test wallet's key." : ""}
        </p>
        <JoinForm network={network} />
      </div>

      <div className="space-y-2.5">
        <section className="cut rounded-3xl bg-ice p-6 text-ink md:p-8">
          <p className="label-mono">Not sold here</p>
          <ul className="mt-6 space-y-3 leading-snug">
            {NOT_SOLD.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-6 leading-snug">{TAKEN_DOWN}</p>
        </section>
        <section className="cut rounded-3xl bg-card p-6 md:p-8">
          <DotLabel>Before you sign up</DotLabel>
          <ul className="mt-6 space-y-1.5">
            <li className="rounded-lg bg-secondary px-5 py-3.5 leading-snug text-muted-foreground">
              An item costs at most {dollars(limits.maxPriceCents)}, and a seller lists at most {limits.maxItems} items.
            </li>
            {PLAINLY.map((line) => (
              <li key={line} className="rounded-lg bg-secondary px-5 py-3.5 leading-snug text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default function SellStart() {
  return (
    <PageShell>
      <Suspense fallback={<div aria-busy className="h-96 rounded-3xl bg-card" />}>
        <Start />
      </Suspense>
    </PageShell>
  );
}
