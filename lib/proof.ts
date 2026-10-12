import { getTableColumns } from "drizzle-orm"

import { orders, products, sellers, stock, vaultHours, vaultState } from "./db/schema"

// What each stored column is, in the reader's words. The page at /proof lists every column of
// every table from the schema and takes its text from here, so the page cannot leave one out:
// a column without a line below fails the test in tests/proof.test.ts.
const NOTES: Record<string, Record<string, string>> = {
  orders: {
    id: "The first half of the order link. Random, so it cannot be guessed.",
    product_id: "Which item was ordered.",
    stock_id: "Which code was set aside for the order.",
    seller_id: "For an item that is another seller's: which seller the order pays. Empty for the shop's own item.",
    state: "Where the order stands: waiting, underpaid, seen, confirmed, delivered, expired, owed a refund, or refunded.",
    price_cents: "The price in dollars.",
    zat: "The amount in ZEC that the price was locked at.",
    address: "The shielded address made for this order.",
    engine_ref: "The payment engine's own name for this order's invoice. Empty for a test order.",
    received_zat: "How much the payment engine saw arrive at that address.",
    txid: "The transaction the payment was seen in. It is shielded: its id shows no sender, no receiver and no amount.",
    owed_zat: "What is owed back to you: all of it if nothing was handed over, the excess if you paid too much. For another seller's item it is that seller who owes it: the shop never held the payment.",
    refund_address: "The shielded address you gave for a refund, if something was owed back to you and you gave one.",
    refunded_at: "When the owner said the refund was sent, or the seller, for another seller's item.",
    supply_ref: "For an item a supplier makes: the supplier's number for what was bought for this order.",
    ready_at: "For an item the owner buys by hand: when your payment was confirmed and the order began to wait for the owner.",
    problem: "What you wrote, if you reported that the item you were handed did not work.",
    problem_at: "When you reported it.",
    problem_closed_at: "When the report was answered: by the owner, or by the seller for another seller's item.",
    problem_reply: "What was answered, if anything was written.",
    problem_refunded: "Whether whoever answered said a refund was sent for the report.",
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
  vault_hours: {
    hour: "An hour the site counted for the token's holders, by its number.",
    from_block: "The first block of that hour on the token's chain.",
    to_block: "The last block of that hour on the token's chain.",
    wallets: "The wallets that held the minimum of the token through that hour, each with how many times the minimum it held. Public: it follows from the token's transfers.",
    each: "What 3,000,000 tokens held through the hour earned, in the reward token.",
    funded: "Everything that had been put into the vault by the end of the hour.",
    total: "Everything all wallets had earned by the end of the hour.",
    root: "The one hash that stood for the whole list after that hour. The server signs it, and a claim is checked against it.",
    counted_at: "When the site counted the hour.",
  },
  vault_state: {
    id: "Always 1: there is one row.",
    vault: "The vault's contract this count belongs to.",
    hour: "The last hour counted.",
    block: "The last block of that hour.",
    balances: "Every wallet's balance of the token at that block, as the chain shows it to anyone.",
    earned: "The list: each wallet with all it has earned since the vault began. Once the reward is closed: each wallet with what it took, and the owner's line with the rest. Public, and each claim shows its wallet and amount on the chain.",
    funded: "Everything put into the vault so far.",
    rates: "The vault's rate, each time the owner set it.",
    closed:
      "Empty while the reward runs. Once the owner has closed it: the last hour that earned, the owner's address that everything not claimed went to, how much nobody had earned and how much holders had earned by then, and when. All of it is shown on the vault's page and in the public list.",
  },
  products: {
    id: "A number for the item.",
    slug: "The item's name in links.",
    name: "The item's name.",
    blurb: "One line about the item.",
    price_cents: "The price in dollars.",
    kind: "Whether the item is a test item, comes from uploaded stock, is made by a supplier when it is paid for, or is bought by the owner by hand once it is paid for.",
    supplier_ref: "For an item a supplier makes: which of the supplier's packages it is.",
    shelf: "Which of the shop's six shelves the item stands on, if the owner put it on one.",
    active: "Whether the item is on the shelf.",
    seller_id: "Whose item it is, when it is another seller's. Empty for the shop's own.",
    taken_down_at: "When the shop's owner took a seller's item down, if they did.",
  },
  sellers: {
    id: "A random name for the seller, used inside the shop.",
    name: "The name the seller chose. It is shown on their items.",
    token_hash: "A hash of the secret in the seller's link. The secret itself is not kept, so the link cannot be read back from here.",
    engine_key: "The payment engine's own key for this seller. With it the shop asks the engine for an address made from the seller's viewing key. It cannot move money.",
    network: "Which Zcash network the seller's viewing key belongs to.",
    created_at: "When the seller signed up.",
    closed_at: "When the shop's owner closed the seller, if they did.",
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
  {
    name: "sellers",
    title: "Sellers",
    about:
      "One row per seller who lists items here. No name of a person, no email and no address. A seller's viewing key is not in this table: the site passes it to the payment engine, which keeps the half that sees incoming payments, encrypted, and the site does not keep it. Nothing here is about a buyer.",
    table: sellers,
  },
  {
    name: "vault_hours",
    title: "Vault hours",
    about: "One row per hour counted for holders of the token. Empty until the vault is open. Nothing here is about a buyer.",
    table: vaultHours,
  },
  {
    name: "vault_state",
    title: "Vault count",
    about: "Where the count for holders of the token stands. All of it is public on the token's chain or follows from it. Nothing here is about a buyer.",
    table: vaultState,
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
