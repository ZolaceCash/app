import { payTestOrder } from "@/lib/orders";

// The stand-in for a payment arriving. It exists because the payment engine is a stand-in: it
// works on test orders only and moves no money. It goes away when a real engine is in place.
export async function POST(_request: Request, context: RouteContext<"/api/orders/[id]/pay">) {
  const { id } = await context.params;
  const paid = id.length <= 40 && (await payTestOrder(id));
  if (!paid) {
    return Response.json({ error: "This order cannot be paid: it is not waiting for a payment." }, { status: 409 });
  }
  return Response.json({ ok: true });
}
