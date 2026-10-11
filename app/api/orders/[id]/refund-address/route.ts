import { setRefundAddress } from "@/lib/orders";

const MESSAGE = {
  "no-order": "No such order.",
  "nothing-owed": "Nothing is owed back on this order, or it has been sent already.",
  "bad-address":
    "That is not a shielded Zcash address of this network, or a character in it is wrong. Give a unified address (u1...) or a Sapling address (zs1...), copied whole.",
} as const;

// The buyer says where a refund should go. Whoever holds the order's link can do this, as with
// everything else about an order: there is no account to check against.
export async function POST(request: Request, context: RouteContext<"/api/orders/[id]/refund-address">) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { address?: unknown } | null;
  if (id.length > 40 || !body || typeof body.address !== "string" || body.address.length > 700) {
    return Response.json({ error: MESSAGE["bad-address"] }, { status: 400 });
  }

  const result = await setRefundAddress(id, body.address);
  if (!result.ok) {
    const status = result.reason === "no-order" ? 404 : result.reason === "nothing-owed" ? 409 : 400;
    return Response.json({ error: MESSAGE[result.reason] }, { status });
  }
  return Response.json({ refundTo: result.refundTo }, { headers: { "Cache-Control": "no-store" } });
}
