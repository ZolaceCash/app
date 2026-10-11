import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { TestItems, TestItemsFallback } from "@/components/shop/test-items";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { DotLabel, PillLink } from "@/components/site/primitives";
import { ShelfGrid } from "@/components/site/shelf-grid";
import { ShopWord } from "@/components/site/shop-status";
import { shopWords } from "@/lib/shop-mode";

export const metadata: Metadata = {
  title: "The shop",
  description:
    "The Zolace shop: no account, a link for a receipt, the item opened in your browser.",
};

async function Head() {
  await connection();
  const words = shopWords();
  return (
    <PageHead figure="matrix" label="The shop" title={words.title} facts={words.facts}>
      {words.about}
    </PageHead>
  );
}

export default function Shop() {
  return (
    <PageShell>
      {/* What the shop takes is read on each request (lib/shop-mode.ts). Until it is known the
          head names the page and claims nothing. */}
      <Suspense
        fallback={
          <PageHead figure="matrix" label="The shop" title="The shop.">
            …
          </PageHead>
        }
      >
        <Head />
      </Suspense>

      {/* Read from the database on each request, so it streams in after the page's frame. */}
      <Suspense fallback={<TestItemsFallback />}>
        <TestItems />
      </Suspense>

      <div className="mt-2.5 flex flex-col gap-5 cut rounded-3xl bg-card p-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-md leading-relaxed text-muted-foreground">
          <ShopWord part="line" />
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
