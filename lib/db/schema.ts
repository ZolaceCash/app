import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Everything the server stores. The public page at /proof is drawn from this file (lib/proof.ts
// explains each column), so a column added here shows up there, or the test for it fails.

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  blurb: text("blurb").notNull(),
  priceCents: integer("price_cents").notNull(),
  // "test": the item is made up on the spot and no money moves. "stock": a code the owner uploaded.
  kind: text("kind", { enum: ["test", "stock"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
})

export const stock = sqliteTable("stock", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  // The item itself, readable. Wiped the moment it is handed over.
  payload: text("payload"),
  // free: on the shelf. held: set aside for an order. given: handed over.
  state: text("state", { enum: ["free", "held", "given"] }).notNull().default("free"),
  orderId: text("order_id"),
})

export const orders = sqliteTable("orders", {
  // The first half of the order link. Unguessable; whoever has it can see the order's status.
  id: text("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  stockId: integer("stock_id"),
  // waiting: nothing has arrived. underpaid: part of the amount has. seen: all of it, not yet in
  // a block. confirmed: in a block, not yet deep enough to hand the item over. delivered.
  // expired: the price lock ran out and nothing arrived. owed: money arrived and nothing was
  // handed over (too little, too late, or no item left), so it is owed back. refunded: that order
  // after the owner sent the refund.
  state: text("state", {
    enum: ["waiting", "underpaid", "seen", "confirmed", "delivered", "expired", "owed", "refunded"],
  }).notNull(),
  priceCents: integer("price_cents").notNull(),
  // The amount to pay in zatoshi (1 ZEC = 100,000,000), fixed when the price was locked.
  zat: integer("zat").notNull(),
  address: text("address").notNull(),
  // The payment engine's own name for this order's invoice. Null for an order against the stand-in.
  engineRef: text("engine_ref"),
  // What the payment engine saw arrive at the address, in zatoshi.
  receivedZat: integer("received_zat").notNull().default(0),
  // The transaction the payment engine saw. The payment is shielded: its id shows no sender, no
  // receiver and no amount.
  txid: text("txid"),
  // What is owed back to the buyer, in zatoshi: all of it when nothing was handed over, the
  // excess when too much was paid.
  owedZat: integer("owed_zat").notNull().default(0),
  // When the owner said the refund was sent.
  refundedAt: integer("refunded_at"),
  // The public half of a key pair the buyer's browser made. The item is sealed to it.
  publicKey: text("public_key").notNull(),
  // The private half, locked with the secret part of the link, which the server never receives.
  wrappedKey: text("wrapped_key").notNull(),
  // The item after delivery: ciphertext only.
  sealed: text("sealed"),
  // True for an order placed against the stand-in payment engine.
  test: integer("test", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  seenAt: integer("seen_at"),
  deliveredAt: integer("delivered_at"),
  closedAt: integer("closed_at"),
})

// The vault (lib/vault.ts): one row per month the owner funded in the vault's contract, with the
// list that month's root stands for. All of it is public on the token's chain or follows from it,
// and nothing here is about a buyer.
export const vaultMonths = sqliteTable("vault_months", {
  // The month, as "2026-10".
  period: text("period").primaryKey(),
  fromBlock: integer("from_block").notNull(),
  toBlock: integer("to_block").notNull(),
  // The root of the month's list, as the vault's contract holds it.
  root: text("root").notNull(),
  // What was put in for the month, in the reward's smallest units. Text: too large for a number.
  total: text("total").notNull(),
  wallets: integer("wallets").notNull(),
  // The list itself: each wallet with its part. A holder's proof is worked out from it.
  list: text("list").notNull(),
  recordedAt: integer("recorded_at").notNull(),
})

export type Product = typeof products.$inferSelect
export type Order = typeof orders.$inferSelect
