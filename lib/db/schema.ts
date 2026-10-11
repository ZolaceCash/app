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
  // "confirmed" is where an order rests when it was paid and there was nothing to hand over: it
  // is owed a refund. "refunded" is that order after the owner sent the refund.
  state: text("state", { enum: ["waiting", "seen", "confirmed", "delivered", "expired", "refunded"] }).notNull(),
  priceCents: integer("price_cents").notNull(),
  // The amount owed in zatoshi (1 ZEC = 100,000,000), fixed when the price was locked.
  zat: integer("zat").notNull(),
  address: text("address").notNull(),
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

export type Product = typeof products.$inferSelect
export type Order = typeof orders.$inferSelect
