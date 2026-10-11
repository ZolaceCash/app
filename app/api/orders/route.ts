import { createOrder } from "@/lib/orders";
import { isPublicKey, isWrapped } from "@/lib/seal";

const MESSAGE = {
  "no-product": "That item is not on the shelf.",
  "no-stock": "That item has just run out.",
  "no-price": "There is no ZEC price right now. One of the two price sources did not answer.",
  "price-disagree": "The price sources differ by more than 2%, so no price is quoted. Try again shortly.",
  "no-engine": "Payments cannot be watched right now, so no order is started. Nothing was charged. Try again shortly.",
} as const;

// Starts an order. The body carries what the buyer's browser made: the public key to seal the
// item to, and its own private key locked with a secret the server is never sent.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.product !== "string" ||
    body.product.length > 80 ||
    !isPublicKey(body.publicKey) ||
    !isWrapped(body.wrappedKey)
  ) {
    return Response.json({ error: "The request is not a valid order." }, { status: 400 });
  }

  const result = await createOrder({
    slug: body.product,
    publicKey: body.publicKey,
    wrappedKey: body.wrappedKey,
  });
  if (!result.ok) {
    const status = result.reason === "no-product" ? 404 : result.reason === "no-stock" ? 409 : 503;
    return Response.json({ error: MESSAGE[result.reason] }, { status });
  }
  return Response.json({ id: result.id }, { status: 201 });
}
