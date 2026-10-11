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
  // "supplier": made by a supplier the moment the order is paid (lib/supplier.ts), never held here.
  kind: text("kind", { enum: ["test", "stock", "supplier"] }).notNull(),
  // For a "supplier" item: which of the supplier's packages it is.
  supplierRef: text("supplier_ref"),
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
  // Where the buyer asked for a refund to be sent: a shielded address they typed in on the order's
  // page. Only there when something is owed back and the buyer gave one.
  refundAddress: text("refund_address"),
  // When the owner said the refund was sent.
  refundedAt: integer("refunded_at"),
  // For an item made by a supplier: the supplier's own number for what was bought for this order.
  supplyRef: text("supply_ref"),
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

// The vault (lib/vault.ts): one row per hour the site counted, with who held how many lots through
// it and what the hour paid. All of it is public on the token's chain or follows from it, and
// nothing here is about a buyer.
export const vaultHours = sqliteTable("vault_hours", {
  // The hour by its number: hours since 1970, in UTC.
  hour: integer("hour").primaryKey(),
  fromBlock: integer("from_block").notNull(),
  toBlock: integer("to_block").notNull(),
  // The wallets that held the minimum through the whole hour, each with how many lots of it.
  wallets: text("wallets").notNull(),
  // What one lot earned for the hour, in the reward's smallest units. Text: too large for a number.
  each: text("each").notNull(),
  // Everything that had been put into the vault by the end of the hour.
  funded: text("funded").notNull(),
  // Everything all wallets had earned by the end of the hour.
  total: text("total").notNull(),
  // The root of the list as it stood after the hour. Empty while nobody has earned anything.
  root: text("root"),
  countedAt: integer("counted_at").notNull(),
})

// Where the counting stands: one row, carried from hour to hour so that an hour is counted from
// that hour's transfers alone.
export const vaultState = sqliteTable("vault_state", {
  id: integer("id").primaryKey(),
  // The vault this count belongs to. Another vault starts another count.
  vault: text("vault").notNull(),
  // The last hour counted, and the last block of it.
  hour: integer("hour").notNull(),
  block: integer("block").notNull(),
  // Every wallet's balance of the token at that block.
  balances: text("balances").notNull(),
  // The list: everything each wallet has earned since the vault began.
  earned: text("earned").notNull(),
  funded: text("funded").notNull(),
  // The vault's rate, each time it was set.
  rates: text("rates").notNull(),
})

export type Product = typeof products.$inferSelect
export type Order = typeof orders.$inferSelect
