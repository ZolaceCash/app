// Other sellers on Zolace (PLAN.md, "Other sellers"). /sell, /sell/start and the seller's desk are
// written from this file. Whether selling is open is a setting of the server (lib/selling.ts): no
// text here says that it is or is not, and the pages read that on each request.

// How it works, as the owner decided it on 12 Oct 2026.
export const DECIDED = [
  {
    name: "Paid straight to you",
    body: "You give the shop a viewing key from your own wallet. For each order it makes one shielded address from that key and watches it. It can see the payment arrive. It cannot move it: the ZEC is in your wallet, never in the shop's.",
  },
  {
    name: "Open to anyone",
    body: "There is no application to pass before you list an item.",
  },
  {
    name: "Free at the start",
    body: "Zolace takes no share of a seller's orders at the start.",
  },
  {
    name: "The same order for the buyer",
    body: "No account, a price held for 15 minutes, a link that is the receipt, and an item sealed to the buyer's browser.",
  },
] as const

// How an order of a seller's item runs.
export const STEPS = [
  {
    name: "A wallet for selling",
    body: "Make a shielded wallet for what you sell here and take its viewing key. The key that spends stays with you.",
  },
  {
    name: "Your item on the shelf",
    body: "A name, a price in dollars and the codes to hand over. A code is kept until its order is paid, then sealed to the buyer and forgotten.",
  },
  {
    name: "The buyer pays you",
    body: "The order gets an address made from your key. The buyer pays it from their own wallet, in shielded ZEC.",
  },
  {
    name: "The item opens",
    body: "Once the payment is three blocks deep, the code opens in the buyer's browser. Nothing is paid out to you afterwards, because nothing was ever held.",
  },
] as const

// What follows from paying the seller directly, said before anyone asks.
export const PLAINLY = [
  "Zolace cannot refund an order of yours. The money never passes through the shop, so a refund is the seller's to send.",
  "An item's page says when it is another seller's, so a buyer knows whom they pay.",
  "A buyer's report about an item of yours comes to your desk. You answer it, and a refund is yours to send. The shop's owner reads the reports too.",
  "A viewing key shows the shop every payment that arrives for it, not only the ones made here. Use a wallet made for selling here.",
  "Your viewing key passes through the shop's server to its payment engine, which keeps the half that sees incoming payments, encrypted. The site itself does not keep it.",
  "The shop still knows what any order here tells it: the item, the amount and the buyer's IP address.",
  "No audit and no legal review of this exist.",
] as const

// What may not be sold, and what the owner does about it (the owner, 12 Oct 2026).
export const NOT_SOLD = [
  "Anything that is illegal to sell.",
  "Codes that were stolen or got by fraud.",
  "Accounts or personal data of other people.",
  "Malware.",
  "Anything that is not a digital item.",
] as const

export const TAKEN_DOWN = "The shop's owner can take an item down or close a seller at any time, without notice."

// What is still not decided. Nothing on the site may fill these in.
export const UNDECIDED = ["Whether a fee comes later, and what it would be."] as const

// The seller's link: the only way back to what they list.
export const THE_LINK = [
  "There is no account. Whoever has this link is the seller: keep it like a password, and off shared screens.",
  "If it is lost it cannot be given again. Your money is not in it: that is in your wallet. What is lost is the way to your items here.",
  "The part after # is sent to the shop with each thing you do at your desk. The shop keeps a hash of it, not the secret.",
] as const
