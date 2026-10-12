import { OG_SIZE, ogCard } from "@/lib/og"
import { storefront } from "@/lib/sellers"
import { shopMode } from "@/lib/shop-mode"

export const alt = "A seller on Zolace"
export const size = OG_SIZE
export const contentType = "image/png"

// The picture for a link to a seller's page: the seller's name, read when the picture is asked
// for. How many items they have is not on it: whoever shows the link keeps the picture for days,
// and a count would go stale. A seller who is not selling gets the site's own picture.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const shop = await storefront(slug).catch(() => null)
  if (!shop) return ogCard({ label: "zolace.cash", title: "Digital goods with no account, paid in shielded ZEC." })

  return ogCard({
    label: "A seller on Zolace",
    title: shop.name,
    // What an order is paid in follows what the shop takes right now (lib/shop-mode.ts).
    paid: { open: "Paid in shielded ZEC, straight to the seller", testnet: "Paid in test coins", preview: "Test order: no money moves" }[shopMode()],
  })
}
