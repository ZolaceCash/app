import type { Section } from "@/lib/content"

// The whitepaper: the design in one document, written from PLAN.md. It is a draft of intent, so
// it names what is undecided and unchecked instead of smoothing it over. It must never promise
// total privacy, claim an audit or a legal review, call the token private, or read as an offer of
// a token.
export const WHITEPAPER = {
  version: "Draft 0.7",
  date: "12 October 2026",
  abstract:
    "Zolace is a shop for digital goods that asks for no account. A buyer picks an item priced in dollars, pays in shielded Zcash to an address made for that one order, and opens the item in the browser. The server holds a viewing key and nothing that can move funds. The token is on Robinhood Chain and apart from the shop: its holders earn by the hour in NVDA, a stock token on that chain, claimed from a contract. This paper describes the design, what the server can and cannot learn, the order in which it will be built, and what is still open.",
}

export const WHITEPAPER_SECTIONS: Section[] = [
  {
    id: "problem",
    heading: "The problem",
    blocks: [
      {
        p: "Buying a digital item usually costs more than its price. It costs an account, an email address, a card number and a record that links all three to what was bought.",
      },
      {
        p: "Most of that is not needed to hand over a code. A shop needs to know that it was paid and where to show the item. Zolace is built around those two facts and tries to collect nothing else.",
      },
    ],
  },
  {
    id: "design",
    heading: "Design in three choices",
    blocks: [
      {
        rows: [
          ["No account", "An order is its own link. There is nothing to sign up for or log in to."],
          ["One address per order", "Each order is paid to a shielded Zcash address that is used once."],
          ["Viewing key only", "The server can see payments arrive. It holds no key that can spend."],
        ],
      },
      {
        p: "The seed of the wallet stays with the owner, offline. If the server were taken over, the attacker could read incoming payments and could not move them.",
      },
    ],
  },
  {
    id: "order",
    heading: "The life of an order",
    blocks: [
      {
        rows: [
          ["Waiting", "The item is reserved, the address is shown, the price is held"],
          ["Seen", "The payment has reached the network"],
          ["Confirmed", "Three blocks have passed, about four minutes"],
          ["Delivered", "The item is handed over on the order page"],
        ],
      },
      {
        p: "An order can also leave this path: it can expire, be underpaid, be overpaid, or be owed a refund. Each of those needs a written rule and a test before real money is accepted.",
      },
      {
        p: "Refunds are made by hand. A shielded payment does not name its sender, so the buyer gives an address and the owner sends the refund from their own wallet, less the network fee.",
      },
      { open: "The rules for the side paths are not written yet. They belong to stage 2 of the roadmap." },
    ],
  },
  {
    id: "delivery",
    heading: "Handing over the item",
    blocks: [
      {
        p: "The order link is /o/<id>#<secret>. The part after # is never sent to a server by a browser, so the server knows which order is being opened without ever holding the secret.",
      },
      {
        p: "The buyer's browser makes a key, and the item is encrypted to it. After delivery the server keeps ciphertext only, and deletes the order some days after it is done.",
      },
      {
        rows: [
          ["From stock", "The owner uploads codes; one is handed over per order"],
          ["Made on demand", "A supplier makes the item when the order is paid"],
        ],
      },
      { p: "The shop starts with goods from stock, which need no integration. Suppliers are added one at a time." },
    ],
  },
  {
    id: "price",
    heading: "Price",
    blocks: [
      {
        p: "Items are priced in dollars and paid in ZEC. The rate comes from two sources. If they differ by more than 2%, no price is quoted. A quoted price is held for 15 minutes.",
      },
      {
        p: "ZEC can still move between the moment the price is held and the moment the payment is confirmed. Inside the 15 minutes that movement is the shop's to carry, not the buyer's.",
      },
    ],
  },
  {
    id: "knowledge",
    heading: "What the server knows",
    blocks: [
      { p: "Privacy here means a short list of things collected, said out loud. It does not mean invisibility." },
      {
        rows: [
          ["Never learned", "Name, email, the paying address or wallet, the secret half of the link, the item after delivery"],
          ["Known", "What was ordered and when, the amount, the IP address of each page load, a refund address if one is given"],
        ],
      },
      {
        list: [
          "No third-party analytics.",
          "No IP addresses in the app's own logs. The host it runs on, and the network in front of it, may keep access logs.",
          "A network in front of the server (Cloudflare, in the planned setup) sees each request before the server does. It never sees the part of a link after #.",
          "Orders deleted some days after they are done.",
        ],
      },
      { p: "A shielded payment is written to the Zcash chain without showing its sender, its receiver or its amount. That holds for a payment sent from a shielded balance; one sent from a transparent address shows that address and the amount." },
      { open: "None of this has been audited." },
    ],
  },
  {
    id: "architecture",
    heading: "Architecture",
    blocks: [
      {
        rows: [
          ["App", "Next.js with a SQLite database"],
          ["Payment engine", "Self-hosted, behind one small interface: make an address, read its status"],
          ["Keys", "A viewing key on the server; the seed offline with the owner"],
          ["Price", "Two sources, 2% tolerance, 15 minute hold"],
        ],
      },
      {
        p: "The payment engine sits behind an interface so that it can be replaced. Two self-hosted engines were compared. One does not handle the current shielded pool. The other was run on testnet with a viewing key and nothing else: it gave each invoice an address of its own, and saw and confirmed a shielded payment once it was patched for the testnet's newest upgrade. It runs beside the shop, switched on by the owner; until then a stand-in takes its place and orders are test orders.",
      },
      {
        open: "Two of that engine's differences from this design are worked around in the shop: its one price source is held against the shop's two and an order is refused when they are more than 2% apart, and the shop waits for three blocks where the engine reports one. One remains: it reads the chain through a block explorer run by others, which then learns which transactions pay this shop. And an engine that falls behind a network upgrade misses payments without an error: the shop refuses orders while the engine reports itself unfit, but has no alarm of its own for that yet.",
      },
    ],
  },
  {
    id: "token",
    heading: "The token",
    blocks: [
      {
        p: "The token is on Robinhood Chain. Orders are not paid on that chain: they are shielded ZEC. The token, the reward to its holders and the contract that pays it are all on the public chain.",
      },
      {
        rows: [
          ["Contract", "A plain token made through Pons, a launchpad on Robinhood Chain. It is the launchpad's contract, not one this project wrote"],
          ["Supply", "1,000,000,000 tokens, minted once. No function mints more. A holder can burn their own"],
          ["Transfer fee", "None. The launchpad takes a fee on trades, in the asset the token trades against, and pays part of it to the token's creator"],
          ["Holder reward", "NVDA, Robinhood's stock token for NVIDIA on the same chain, bought with that creator fee and put into a contract by the owner"],
          ["Minimum", "A wallet has to hold at least 3,000,000 tokens through a whole hour to earn that hour"],
          ["Counting", "A wallet counts with the lowest balance it had in the hour, and earns at most 0.01 USD an hour for every 3,000,000 tokens of it: twice as many earns twice that"],
          ["Claiming", "A wallet takes what it has earned from the contract itself, whenever it likes. Nothing is sent to it"],
        ],
      },
      {
        p: "The contract that pays is the vault. After each hour the site works out, from the token's transfers, what every wallet has earned since the vault began, and signs one hash that stands for that list. A wallet proves its line against the hash, and the contract pays what the wallet has earned and not yet taken. The contract checks three things: that the list is signed, that nothing is paid twice, and that all wallets together are never paid more than the rate allows for the whole supply over the hours the vault has run.",
      },
      {
        p: "0.01 USD an hour for every 3,000,000 tokens is a ceiling, not a promise. The contract carries it as a rate in NVDA that the owner sets from NVDA's price, and an hour pays it only while the vault holds enough for all the tokens that count. When it does not, what is left is shared evenly, and then hours pay nothing until more is put in.",
      },
      {
        p: "The token has no owner. Nobody can mint, stop transfers, block a wallet or move another wallet's tokens, because no such function exists. The vault's owner can set the rate and name the signer, and cannot take anything out: no function withdraws.",
      },
      {
        p: "The owner puts the reward into the vault from their own wallet, by a plain transfer. The server holds a viewing key for the shop and one key for this chain: the key that signs the hourly list. That key holds no funds and sends no transaction. It is still a power: whoever held it, or the owner's key, could sign a list of their own, and the contract would pay it, up to that limit for all wallets together. So what sits in the vault is not a holder's until it is claimed, and the owner keeps the vault to what the coming days need.",
      },
      {
        p: "Earlier drafts paid holders once a month from a list the owner put on the chain, and before that in shielded ZEC, by hand. This draft pays by the hour and lets a wallet claim at any time. What it gains: nobody waits for the owner. What it costs: the list is no longer fixed on the chain before it is paid, and the server holds a key whose signature the contract trusts.",
      },
      {
        p: "Nothing on the token's side is private. Who holds it, every transfer, the whole list and each claim are public on Robinhood Chain. Buying in the shop needs no token and no wallet on that chain.",
      },
      {
        p: "NVDA is not this project's token. Robinhood issues it and describes it as a tokenised debt security, not a share, and it restricts where the token may be offered. Nothing here is endorsed by Robinhood or by NVIDIA, and whether a holder may be handed NVDA where they live has not been reviewed.",
      },
      { token: true },
      {
        open: "The vault's contract has been written and tested. It has not been audited, and no legal review has been done of the token, of the reward or of handing holders NVDA. The token's own contract is the launchpad's: it was not written here and not audited here. No hour and no amount is promised. Whether a share of the shop's orders is added to the reward is not decided. Nothing in this paper is an offer.",
      },
    ],
  },
  {
    id: "risks",
    heading: "Risks",
    blocks: [
      {
        rows: [
          ["Law", "Rules on paying with crypto assets, on privacy coins, on selling vouchers or gift cards without identity checks, on tokens that pay holders from fees or from a shop's takings, and on handing people a tokenised security differ by country and can forbid parts of this"],
          ["Chain", "The token depends on one chain that one company launched. Its sequencer leaves out transactions tied to sanctioned addresses. Which countries are shut out has not been checked"],
          ["Token", "The token's contract and the contracts it trades on are the launchpad's. They are not this project's and were not audited here"],
          ["Reward", "The contract pays against a list the server signs. It caps what all wallets together can be paid, but it does not check the list, and whoever holds the signing key or the owner's key decides who is on it. The vault's contract has not been audited. NVDA is another company's token, with that company's rules and a price that moves"],
          ["Suppliers", "Many suppliers forbid resale. Each item's terms have to be read before it is listed"],
          ["Price", "ZEC can move while a price is held"],
          ["Engine", "The payment engine is a patched copy of an outside project, run by the shop, and reads the chain through a block explorer run by others. Behind a network upgrade it misses payments without an error"],
        ],
      },
      { open: "No legal review has been done. This paper is a description of a design, not advice of any kind." },
    ],
  },
  {
    id: "status",
    heading: "Status and open questions",
    blocks: [
      {
        p: "The order flow, the sealing of the item and the order page are built. So is the shop's side of real payments, and the engine behind it has taken a payment on Zcash's test network.",
      },
      { shop: true },
      {
        p: "What the shop takes at this moment is said in the box above: it is read when this page is opened.",
      },
      {
        list: [
          "How the payment engine reads the chain without telling a third party which transactions are ours, and how the shop notices an engine that has stopped seeing payments.",
          "The written rules for expired, underpaid, overpaid and refunded orders.",
          "How many days a finished order is kept.",
          "The support channel for refunds, which will need no email.",
          "The first goods on the shelf.",
          "Whether a share of the shop's orders is added to the holders' reward.",
        ],
      },
      { p: "The roadmap lists the stages in order. A stage ends when its test passes, not on a date." },
    ],
  },
]
