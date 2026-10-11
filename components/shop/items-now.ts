import { cache } from "react"

import { listItems } from "@/lib/orders"

// What is on sale, read once for a request: the list of items and the shelves both show it.
export const itemsNow = cache(() => listItems())
