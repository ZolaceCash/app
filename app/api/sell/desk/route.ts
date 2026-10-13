import { setNotice, testNotice } from "@/lib/seller-notify";
import { addCodes, addItem, clearCodes, desk, leave, saveItem, sellerAnswer, sellerOf, sellerRefunded } from "@/lib/sellers";

// A seller's desk. There is no session and no cookie: every request carries the secret of the
// seller's link in its Authorization header, and whoever holds it is the seller. The secret is in
// no address, so it is in no link and no history but the seller's own.

const NOT_YOURS = Response.json({ error: "That link does not open a desk." }, { status: 401, headers: { "Cache-Control": "no-store" } });

async function who(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? sellerOf(header.slice(7).trim()) : null;
}

const text = (value: unknown, most: number) => (typeof value === "string" && value.length <= most ? value : null);

export async function GET(request: Request) {
  const seller = await who(request);
  if (!seller) return NOT_YOURS.clone();
  return Response.json(await desk(seller), { headers: { "Cache-Control": "no-store" } });
}

// One thing the seller does, named in `do`. Each is checked again against the seller it came
// from: an item or an order that is not theirs is not found.
export async function POST(request: Request) {
  const seller = await who(request);
  if (!seller) return NOT_YOURS.clone();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.do !== "string") return Response.json({ error: "The request names nothing to do." }, { status: 400 });

  const item = { name: text(body.name, 400), blurb: text(body.blurb, 800), price: text(body.price, 20), shelf: text(body.shelf, 40) };
  const whole = (entry: typeof item): entry is { name: string; blurb: string; price: string; shelf: string } =>
    entry.name !== null && entry.blurb !== null && entry.price !== null && entry.shelf !== null;
  const id = Number(body.id);
  const ref = text(body.ref, 12) ?? "";

  let result: { ok: true; said?: string } | { ok: false; error: string } = { ok: false, error: "There is no such thing to do." };
  if (body.do === "add-item" && whole(item)) {
    const made = await addItem(seller, item);
    result = made.ok ? { ok: true, said: "Added, off the shelf. Put codes behind it, then put it on the shelf." } : made;
  } else if (body.do === "save-item" && whole(item) && Number.isSafeInteger(id)) {
    const saved = await saveItem(seller, id, { ...item, active: body.active === true });
    result = saved.ok ? { ok: true, said: "Saved." } : saved;
  } else if (body.do === "add-codes" && Number.isSafeInteger(id)) {
    const codes = text(body.codes, 1_100_000);
    const added = codes === null ? { ok: false as const, error: "That is too much at once. Split it up." } : await addCodes(seller, id, codes);
    result = added.ok ? { ok: true, said: `${added.added} code${added.added === 1 ? "" : "s"} added.` } : added;
  } else if (body.do === "clear-codes" && Number.isSafeInteger(id)) {
    const cleared = await clearCodes(seller, id);
    result = cleared.ok ? { ok: true, said: `${cleared.removed} unsold code${cleared.removed === 1 ? "" : "s"} removed.` } : cleared;
  } else if (body.do === "refunded") {
    const done = body.sent === true ? await sellerRefunded(seller, ref) : { ok: false as const, error: "Tick the box once the refund has left your wallet." };
    result = done.ok ? { ok: true, said: "Marked as sent. The buyer's page says so." } : done;
  } else if (body.do === "answer") {
    const outcome = body.outcome;
    const done =
      outcome === "refunded" || outcome === "none"
        ? await sellerAnswer(seller, ref, { refunded: outcome === "refunded", reply: text(body.reply, 2000) ?? "" })
        : { ok: false as const, error: "Say whether you sent a refund for it or not." };
    result = done.ok ? { ok: true, said: "Answered. The buyer reads it on the order's page." } : done;
  } else if (body.do === "set-notice") {
    const address = text(body.address, 400);
    const kept = address === null ? { ok: false as const, error: "That address is too long." } : await setNotice(seller, address);
    result = kept.ok ? { ok: true, said: address?.trim() ? "Saved. Send a test line to see that it arrives." : "Removed. Nothing is sent any more." } : kept;
  } else if (body.do === "leave") {
    const done = body.sure === true ? await leave(seller) : { ok: false as const, error: "Tick the box first: this cannot be undone." };
    result = done.ok ? { ok: true, said: "You have stopped selling here." } : done;
  } else if (body.do === "test-notice") {
    const sent = await testNotice(seller);
    result = sent.ok ? { ok: true, said: "A test line was sent." } : sent;
  }

  if (!result.ok) return Response.json({ error: result.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  // The desk as it stands now goes back with the answer, so the screen needs no second request.
  // The seller is read again first: what was just done may have changed their own row.
  const now = (await who(request)) ?? seller;
  return Response.json({ ok: true, said: result.said, desk: await desk(now) }, { headers: { "Cache-Control": "no-store" } });
}
