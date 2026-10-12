import { join } from "@/lib/sellers";

const MESSAGE = {
  closed: "Selling is not open on this server.",
  "bad-name": "Choose a name of 2 to 40 letters, digits and spaces. It may not use the shop's own name.",
  "not-agreed": "Tick the box to say you have read what may not be sold here.",
  "bad-key":
    "That is not a viewing key of this network, or a character in it is wrong. Paste the unified full viewing key from your wallet, whole. Never a seed phrase or a spending key.",
  taken:
    "This viewing key is signed up here already. Open your desk with the link you were given. If the link is lost, sign up with the viewing key of a new wallet.",
  busy: "Too many sign-ups at this moment. Wait a minute and try again.",
  full: "The shop has all the sellers it takes for now.",
  unavailable: "The payment engine did not answer, so nothing was signed up. Try again shortly.",
} as const;

const STATUS = { closed: 403, "bad-name": 400, "not-agreed": 400, "bad-key": 400, taken: 409, busy: 429, full: 403, unavailable: 503 } as const;

// A new seller signs up: a name buyers will read, a viewing key, and a yes to the rules. The
// viewing key is passed to the payment engine and is not kept or logged here. The answer carries
// the secret of the seller's link, once.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.name !== "string" || body.name.length > 200 || typeof body.viewingKey !== "string" || body.viewingKey.length > 4000) {
    return Response.json({ error: "The request is not a sign-up." }, { status: 400 });
  }

  const result = await join({ name: body.name, viewingKey: body.viewingKey, agreed: body.agreed === true });
  if (!result.ok) return Response.json({ error: MESSAGE[result.reason] }, { status: STATUS[result.reason] });
  return Response.json({ token: result.token }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
