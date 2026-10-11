import { getTableColumns } from "drizzle-orm"

import { orders, products, stock } from "./db/schema"

// What each stored column is, in the reader's words. The page at /proof lists every column of
// every table from the schema and takes its text from here, so the page cannot leave one out:
// a column without a line below fails the test in tests/proof.test.ts.
const NOTES: Record<string, Record<string, string>> = {
  orders: {
    id: "The first half of the order link. Random, so it cannot be guessed.",
    product_id: "Which item was ordered.",
    stock_id: "Which code was set aside for the order.",
    state: "Where the order stands: waiting, seen, confirmed, delivered, expired or refunded.",
    price_cents: "The price in dollars.",
    zat: "The amount in ZEC that the price was locked at.",
    address: "The shielded address made for this order.",
    public_key: "The public half of a key pair your browser made. The item is sealed to it.",
    wrapped_key: "The private half, locked with the secret part of your link. Without that secret it cannot be opened, and the server is never sent the secret.",
    sealed: "The item after delivery, as ciphertext only your browser can open.",
    test: "Whether the order was a test order with a pretend payment.",
    created_at: "When the order was placed.",
    expires_at: "When the price lock runs out.",
    seen_at: "When the payment was first seen.",
    delivered_at: "When the item was handed over.",
    closed_at: "When the order finished or expired. Orders are deleted some days after this.",
  },
  stock: {
    id: "A number for the code.",
    product_id: "Which item the code belongs to.",
    payload: "The code itself, readable, until it is handed over. Then it is wiped.",
    state: "Free, set aside for an order, or handed over.",
    order_id: "The order it was set aside for.",
  },
  products: {
    id: "A number for the item.",
    slug: "The item's name in links.",
    name: "The item's name.",
    blurb: "One line about the item.",
    price_cents: "The price in dollars.",
    kind: "Whether the item is a test item or comes from uploaded stock.",
    active: "Whether the item is on the shelf.",
  },
}

const TABLES = [
  {
    name: "orders",
    title: "Orders",
    about: "One row per order. This is everything the server keeps about a purchase.",
    table: orders,
  },
  {
    name: "stock",
    title: "Stock",
    about: "The codes on the shelves. A code is readable only until it is delivered.",
    table: stock,
  },
  {
    name: "products",
    title: "Products",
    about: "What is on sale. Nothing here is about a buyer.",
    table: products,
  },
]

export type StoredColumn = { name: string; note: string | undefined }

// Every table and column the server has, straight from the schema.
export const STORED = TABLES.map(({ name, title, about, table }) => ({
  name,
  title,
  about,
  columns: Object.values(getTableColumns(table)).map(
    (column): StoredColumn => ({ name: column.name, note: NOTES[name]?.[column.name] })
  ),
}))

// What is deliberately not in any table.
export const NEVER_STORED = [
  "Your name or your email. No form asks for them.",
  "The secret half of your order link. Browsers do not send the part after #.",
  "The wallet or the address a payment came from. A shielded payment does not show it.",
  "Your IP address. It reaches the server with each request, but the app does not write it down. The host the site runs on, and the network in front of it, may keep access logs of their own.",
  "A readable copy of an item after it is delivered.",
]
