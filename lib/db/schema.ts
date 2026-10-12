import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Everything the server stores. The public page at /proof is drawn from this file (lib/proof.ts
// explains each column), so a column added here shows up there, or the test for it fails.

// The shelves of the shop, by the name in their link (lib/catalog.ts has what each one is).
export const SHELF_SLUGS = ["vouchers", "licences", "gift-cards", "ai-credit", "esim", "gift-links"] as const
export type ShelfSlug = (typeof SHELF_SLUGS)[number]

// Another seller on the shop (lib/sellers.ts). No name of a person and no way to reach one: a
// seller is a label a buyer reads, a secret link, and a key the payment engine gave. The viewing
// key itself is not here: it is passed to the payment engine and not kept by the site.
export const sellers = sqliteTable("sellers", {
  id: text("id").primaryKey(),
  // What a buyer reads on an item's page as who sells it.
  name: text("name").notNull(),
  // A hash of the secret in the seller's link. The secret itself is not kept.
  tokenHash: text("token_hash").notNull().unique(),
  // The payment engine's own key for this seller: with it the shop asks the engine for an address
  // made from the seller's viewing key. It opens invoices. It cannot move money.
  engineKey: text("engine_key").notNull(),
  // Which network the viewing key belongs to. A seller of the test network sells nothing on the real one.
  network: text("network", { enum: ["testnet", "mainnet"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  // When the shop's owner closed this seller. Their items are off the shelf from then on.
  closedAt: integer("closed_at"),
})

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  blurb: text("blurb").notNull(),
  priceCents: integer("price_cents").notNull(),
  // "test": the item is made up on the spot and no money moves. "stock": a code the owner uploaded.
  // "supplier": made by a supplier the moment the order is paid (lib/supplier.ts), never held here.
  // "hand": bought by the owner, by hand, after the order is paid, and handed over on the owner's
  // screen. Nothing is bought before the money is in.
  kind: text("kind", { enum: ["test", "stock", "supplier", "hand"] }).notNull(),
  // For a "supplier" item: which of the supplier's packages it is.
  supplierRef: text("supplier_ref"),
  // Which shelf the item stands on, as the owner chose. Null: on none, it is only in the list of items.
  shelf: text("shelf", { enum: SHELF_SLUGS }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Whose item it is. Null: the shop's own. Otherwise an order of it is paid straight to that
  // seller's wallet and the shop never holds the money.
  sellerId: text("seller_id").references(() => sellers.id),
  // When the shop's owner took a seller's item down. The seller cannot put it back.
  takenDownAt: integer("taken_down_at"),
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
  // The seller the order pays, for an item that is another seller's. Null: the shop's own item.
  // What such an order is owed back is the seller's to send, never the shop's.
  sellerId: text("seller_id"),
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
  // For an item the owner buys by hand: when the payment was deep enough and the order began to
  // wait for the owner. The owner's screen lists an order to buy only once this is set.
  readyAt: integer("ready_at"),
  // What the buyer wrote about an item that was handed over and did not work, and when. Null: no
  // report. The address a refund for it would go to is `refundAddress`.
  problem: text("problem"),
  problemAt: integer("problem_at"),
  // The owner's answer: when it was given, what it says, and whether a refund was sent with it.
  problemClosedAt: integer("problem_closed_at"),
  problemReply: text("problem_reply"),
  problemRefunded: integer("problem_refunded", { mode: "boolean" }),
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
  // Set once the owner has closed the reward: the last hour that earned, the address what was
  // left went to, how much that was, and when. Empty while the reward runs.
  closed: text("closed"),
})

export type Product = typeof products.$inferSelect
export type Seller = typeof sellers.$inferSelect
export type Order = typeof orders.$inferSelect
