import { OG_SIZE, ogCard } from "@/lib/og"
import { getItem } from "@/lib/orders"
import { shopMode } from "@/lib/shop-mode"

export const alt = "An item on the shelf at Zolace, with its price"
export const size = OG_SIZE
export const contentType = "image/png"

// The picture for a link to one item: its name and its price, read when the picture is asked for.
// How many are left is not on it: whoever shows the link keeps the picture for days, and a count
// would go stale. An item that is not on sale gets the site's own picture.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = slug.length <= 60 ? await getItem(slug).catch(() => null) : null
  if (!item) return ogCard({ label: "zolace.cash", title: "Digital goods with no account, paid in shielded ZEC." })

  return ogCard({
    label: "The shop",
    title: item.name,
    price: `$${(item.priceCents / 100).toFixed(2)}`,
    // What the price is paid in follows what the shop takes right now (lib/shop-mode.ts).
    paid:
      item.kind === "test"
        ? "Test item: no money moves"
        : { open: "Paid in shielded ZEC", testnet: "Paid in test coins", preview: "Test order: no money moves" }[shopMode()],
  })
}
