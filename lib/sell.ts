// Other sellers on Zolace: the plan as the owner set it on 12 Oct 2026 (PLAN.md, "Other sellers").
// /sell is written from this file. It says what is decided and lists what is not. None of it is
// built: the page says so, and no text here may read as if selling were open.

// What is decided.
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

// How an order of a seller's item is meant to run.
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
  "An item's page will say when it is another seller's, so a buyer knows whom they pay.",
  "A viewing key shows the shop every payment that arrives for it, not only the ones made here. Use a wallet made for selling here.",
  "The shop still knows what any order here tells it: the item, the amount and the buyer's IP address.",
  "No audit and no legal review of this plan exist.",
] as const

// What is not decided. Nothing on the site may fill these in.
export const UNDECIDED = [
  "How a seller comes back to their items without an account.",
  "What happens when a buyer reports an item that does not work.",
  "What may not be sold, and when an item is taken off the shelf.",
  "Whether a fee comes later, and what it would be.",
  "The day selling opens.",
] as const
