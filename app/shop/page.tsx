import type { Metadata } from "next";
import { Suspense } from "react";

import { TestItems, TestItemsFallback } from "@/components/shop/test-items";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { DotLabel, PillLink } from "@/components/site/primitives";
import { ShelfGrid } from "@/components/site/shelf-grid";

export const metadata: Metadata = {
  title: "The shop",
  description:
    "Try a test order at Zolace: no account, a link for a receipt, the item opened in your browser. No real payments yet.",
};

export default function Shop() {
  return (
    <PageShell>
      <PageHead
        figure="matrix"
        label="The shop"
        title="Try an order. No money moves."
        facts={["Test orders only", "No real payments yet", "No account"]}
      >
        The shop has no real goods and takes no real payments yet. What works is the order
        itself: pick a test item, get a link, watch the order run and open a made-up item in your
        browser.
      </PageHead>

      {/* Read from the database on each request, so it streams in after the page's frame. */}
      <Suspense fallback={<TestItemsFallback />}>
        <TestItems />
      </Suspense>

      <div className="mt-2.5 flex flex-col gap-5 cut rounded-3xl bg-card p-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-md leading-relaxed text-muted-foreground">
          A test order uses the live ZEC price and a pretend payment. Everything else is as the
          real shop will run it.
        </p>
        <div className="flex flex-wrap gap-2">
          <PillLink href="/docs/placing-an-order" variant="secondary" arrow>
            How to order
          </PillLink>
          <PillLink href="/proof" variant="outline">
            What is stored
          </PillLink>
        </div>
      </div>

      <div className="px-3 pt-24 pb-10 md:px-4">
        <DotLabel>The shelves</DotLabel>
        <h2 className="mt-5 max-w-xl text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-5xl">
          Six shelves, none stocked yet.
        </h2>
        <p className="mt-6 max-w-xl leading-relaxed text-pretty text-muted-foreground">
          A shelf has no prices until its first stock is uploaded. The filled shelves open first;
          the dark ones are planned.
        </p>
      </div>
      <ShelfGrid />
    </PageShell>
  );
}
