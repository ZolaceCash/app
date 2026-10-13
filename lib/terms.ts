import { KEPT_DAYS } from "@/lib/order-times"

// The shop's terms (/terms). They are the rules as the site applies them, gathered on one page,
// with four things the owner added on 13 Oct 2026: the law where someone is is theirs to know, an
// item is sold as it is, the shop may take anything down at any time, and the terms can change.
// Every other line here is something the code does: change the code and this file together.
// No lawyer has reviewed them, and the page says so first.
//
// A number that is a setting of the server (the hours an item bought to order may take, the
// limits a seller works within) is not written here: the terms point at the page that states it.

// When the terms last changed. Change it with any change to TERMS.
export const TERMS_CHANGED = "13 Oct 2026"

export type Term = { id: string; heading: string; lines: string[] }

export const TERMS: Term[] = [
  {
    id: "what-these-are",
    heading: "What these are",
    lines: [
      "These are the terms the shop runs by. They cover buying and selling at Zolace, and nothing else.",
      "They are written from the rules the site applies. No lawyer has reviewed them, and nothing here has been audited.",
      "The token and its reward are not part of them. The pages about the token say what those are.",
    ],
  },
  {
    id: "an-order",
    heading: "An order",
    lines: [
      "The shop sells digital items. An order asks nothing about you: no account, no name, no email.",
      "An order gets a link, and the link is the receipt. Whoever has the link has the order.",
      "A lost link cannot be given again. The shop does not have the part of it that opens the item.",
    ],
  },
  {
    id: "price-and-payment",
    heading: "Price and payment",
    lines: [
      "An item is priced in dollars and paid in shielded ZEC, from your own wallet, to an address made for that one order.",
      "The amount in ZEC is fixed when you order and held for 15 minutes. It comes from two price sources; if they differ by more than 2%, no order is started.",
      "The item is handed over for the whole amount, seen before the 15 minutes ran out, once the payment is three blocks deep.",
    ],
  },
  {
    id: "owed-back",
    heading: "What is owed back to you",
    lines: [
      "Too little by the time the 15 minutes run out: what you sent is owed back, and nothing is handed over.",
      "Too late: what you sent is owed back, and nothing is handed over.",
      "More than the price: the item is handed over and the excess is owed back.",
      "Paid in full and in time, and no item could be handed over: all of it is owed back.",
      "What is owed is sent by hand to a shielded address you give on the order's page, less the network's fee. An amount smaller than that fee cannot be sent. No time is promised.",
    ],
  },
  {
    id: "as-it-is",
    heading: "An item is sold as it is",
    lines: [
      "If an item you were handed does not work, say so on the order's page. The report is read and answered there, by hand.",
      "The answer is a refund or the reason there is none. A report does not by itself mean a refund, and no time is promised for an answer.",
      "That is what the shop does for an item that does not work. Nothing beyond it is promised.",
    ],
  },
  {
    id: "bought-to-order",
    heading: "Items bought after you pay",
    lines: [
      "Some items are not kept in stock. The item's page says so, and how many hours the shop has to hand it over once your payment is confirmed.",
      "If it is not handed over in that time, or cannot be bought, all of your payment is owed back.",
    ],
  },
  {
    id: "another-sellers-item",
    heading: "An item of another seller",
    lines: [
      "Some items are another seller's. Their pages say so and name the seller before you order.",
      "Your payment for one goes straight to that seller's wallet. The shop never holds it, so the shop cannot send it back.",
      "What is owed back to you on such an order is owed by the seller, and a report about the item is the seller's to answer. The shop's owner reads the report too.",
      "Zolace does not check a seller's items before they are listed, and cannot make a seller pay.",
    ],
  },
  {
    id: "selling",
    heading: "Selling here",
    lines: [
      "A seller signs up with the viewing key of a wallet of their own. There is no account: the link shown at sign-up is the seller's desk, and a lost link cannot be given again.",
      "Not sold here: anything that is illegal to sell, codes that were stolen or got by fraud, accounts or personal data of other people, malware, and anything that is not a digital item.",
      "An item's price and how many items a seller lists are limited. The sign-up page states the limits.",
      "A seller's orders are paid to the seller. So what such an order is owed back is the seller's to send, and a buyer's report is the seller's to answer.",
      "The shop takes no share of a seller's orders at the start. Whether a fee comes later is not decided.",
    ],
  },
  {
    id: "what-the-shop-may-do",
    heading: "What the shop may do",
    lines: [
      "The shop may take any item off the shelf, close a seller, or stop selling something at any time, without notice.",
      "An order that is already paid still runs to its end: it is handed over, or what was paid is owed back.",
    ],
  },
  {
    id: "where-you-are",
    heading: "The law where you are",
    lines: [
      "Whether buying or selling here is allowed where you are is yours to know, and yours to answer for.",
      "The shop does not check it, and asks nothing about you that could tell it.",
    ],
  },
  {
    id: "what-is-kept",
    heading: "What is kept, and for how long",
    lines: [
      `An order is deleted from the server ${KEPT_DAYS} days after it finishes or runs out of time. Its link then opens nothing, so save the item before that.`,
      "An order that is still owed a refund, or has a report nobody answered, is kept until that is dealt with.",
      "The payment is shielded. The shop still knows the order, the amount and what a request tells any server, such as your IP address. The page of what is stored lists every column.",
    ],
  },
  {
    id: "changes",
    heading: "Changes",
    lines: [
      "These terms can change. This page says when they last did.",
      "An order runs by the terms that stood when it was placed.",
    ],
  },
]
