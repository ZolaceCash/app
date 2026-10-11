import { OG_SIZE, ogCard } from "@/lib/og"

export const alt = "Zolace: digital goods with no account, paid in shielded ZEC"
export const size = OG_SIZE
export const contentType = "image/png"

// The picture for a link to any page that has none of its own. It says nothing that changes.
export default function Image() {
  return ogCard({ label: "zolace.cash", title: "Digital goods with no account, paid in shielded ZEC." })
}
