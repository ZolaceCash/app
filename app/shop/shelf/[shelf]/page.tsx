import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { itemsNow } from "@/components/shop/items-now";
import { ItemCards } from "@/components/shop/test-items";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { findShelf, SHELVES } from "@/lib/catalog";
import type { ShelfItem } from "@/lib/orders";
import { shopWords } from "@/lib/shop-mode";
import { cn } from "@/lib/utils";

// One shelf of the shop: the items that stand on it, and no others. The six shelves are fixed
// (lib/catalog.ts), so a name that is none of them is not found; a shelf with nothing on it has
// a page all the same, and says so.
export async function generateMetadata({ params }: PageProps<"/shop/shelf/[shelf]">): Promise<Metadata> {
  const { shelf: slug } = await params;
  const shelf = findShelf(slug);
  if (!shelf) return { title: "A shelf" };
  const title = `${shelf.name} at Zolace`;
  const description = `${shelf.blurb} No account: an order gets a link, and the item opens in your browser.`;
  return { title, description, openGraph: { siteName: "Zolace", type: "website", title, description, url: `/shop/shelf/${shelf.slug}` } };
}

// What is on a shelf is read from the database, so the page waits for it instead of showing a
// frame first.
export const instant = false;

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ShelfPage({ params }: PageProps<"/shop/shelf/[shelf]">) {
  const { shelf: slug } = await params;
  const shelf = findShelf(slug);
  if (!shelf) notFound();
  await connection();

  let all: ShelfItem[];
  try {
    all = await itemsNow();
  } catch {
    return (
      <PageShell>
        <p className="cut rounded-3xl bg-card p-6 leading-relaxed text-muted-foreground">
          The shop cannot reach its database right now, so this shelf cannot be shown. The rest of the site is
          unaffected.
        </p>
      </PageShell>
    );
  }

  const items = all.filter((item) => item.shelf === shelf.slug);
  // What can be ordered right now: an item whose last code is gone is listed, and not counted.
  const onSale = items.filter((item) => item.left !== 0);
  const from = onSale.length > 0 ? Math.min(...onSale.map((item) => item.priceCents)) : null;
  const counts = new Map(SHELVES.map((entry) => [entry.slug, all.filter((item) => item.shelf === entry.slug && item.left !== 0).length]));
  const place = SHELVES.findIndex((entry) => entry.slug === shelf.slug) + 1;

  return (
    <PageShell>
      <PageHead
        figure="matrix"
        label={`The shop / Shelf 0${place}`}
        title={shelf.name}
        facts={[
          onSale.length === 0 ? "Nothing on sale" : onSale.length === 1 ? "1 item on sale" : `${onSale.length} items on sale`,
          ...(from === null ? [] : [`From ${dollars(from)}`]),
          "No account",
        ]}
      >
        {shelf.blurb} {shopWords().line}
      </PageHead>

      {/* The other shelves, each with how many items can be ordered from it right now. */}
      <nav aria-label="The shelves" className="mb-2.5 flex flex-wrap gap-1.5">
        <PillLink href="/shop" variant="secondary" size="sm">
          All items
        </PillLink>
        {SHELVES.map((entry) => {
          const here = entry.slug === shelf.slug;
          const count = counts.get(entry.slug) ?? 0;
          return (
            <Link
              key={entry.slug}
              href={`/shop/shelf/${entry.slug}`}
              aria-current={here ? "page" : undefined}
              className={cn(
                "label-mono inline-flex h-9 items-center gap-2 rounded-md px-3.5 outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/40",
                here ? "bg-primary text-primary-foreground" : count > 0 ? "bg-card hover:bg-secondary" : "bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              {entry.name}
              {count > 0 ? <span className={cn("rounded px-1.5 py-0.5", here ? "bg-white/20" : "bg-foreground/10")}>{count}</span> : null}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <div className="cut rounded-3xl bg-card p-6 md:p-8">
          <p className="label-mono text-muted-foreground">Nothing here yet</p>
          <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
            No item stands on this shelf right now. A shelf has prices once its first item is in stock.
          </p>
          <div className="mt-6">
            <PillLink href="/shop" variant="secondary" arrow>
              Everything on sale
            </PillLink>
          </div>
        </div>
      ) : (
        <ItemCards items={items} order={shopWords().order} />
      )}
    </PageShell>
  );
}
