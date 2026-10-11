import type { ComponentType } from "react"

import { GiftIcon, KeyIcon, PhoneIcon, SendIcon, ShelfIcon, SparkIcon } from "@/components/site/icons"

// The kinds of goods the shop is planned to carry. These are shelves, not products: nothing has a
// price or stock until the owner uploads the first codes (see PLAN.md, "How an item is handed over").
export type Shelf = {
  slug: string
  name: string
  blurb: string
  // "stock": a code the owner uploaded. "supplier": made by a supplier when the order is paid.
  handover: "stock" | "supplier"
  icon: ComponentType<{ className?: string }>
}

export const SHELVES: Shelf[] = [
  {
    slug: "vouchers",
    name: "Vouchers",
    blurb: "Codes for games and services, one per order.",
    handover: "stock",
    icon: ShelfIcon,
  },
  {
    slug: "licences",
    name: "Software licences",
    blurb: "A licence key, shown on the order page.",
    handover: "stock",
    icon: KeyIcon,
  },
  {
    slug: "gift-cards",
    name: "Gift cards",
    blurb: "Card codes in fixed dollar amounts.",
    handover: "stock",
    icon: GiftIcon,
  },
  {
    slug: "ai-credit",
    name: "AI credit keys",
    blurb: "A key made the moment the order is paid.",
    handover: "supplier",
    icon: SparkIcon,
  },
  {
    slug: "esim",
    name: "eSIM",
    blurb: "Mobile data, installed from a QR code.",
    handover: "supplier",
    icon: PhoneIcon,
  },
  {
    slug: "gift-links",
    name: "Gift links",
    blurb: "Pay for an item and send it as a link.",
    handover: "supplier",
    icon: SendIcon,
  },
]

export const HANDOVER_LABEL: Record<Shelf["handover"], string> = {
  stock: "First shelf",
  supplier: "Planned",
}
