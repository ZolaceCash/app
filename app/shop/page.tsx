import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { ShopShelves, ShopShelvesFallback } from "@/components/shop/shelves-now";
import { TestItems, TestItemsFallback } from "@/components/shop/test-items";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
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

      {/* Which shelves have something on them follows the stock, like the list above. */}
      <Suspense fallback={<ShopShelvesFallback />}>
        <ShopShelves />
      </Suspense>
    </PageShell>
  );
}
