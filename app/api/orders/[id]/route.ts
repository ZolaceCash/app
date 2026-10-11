import { readOrder } from "@/lib/orders";

// Where an order stands. Reading it also moves it along (expiry, confirmations, delivery), so the
// order page only has to ask. The answer never holds a readable item, only the sealed copy.
export async function GET(_request: Request, context: RouteContext<"/api/orders/[id]">) {
  const { id } = await context.params;
  const order = id.length <= 40 ? await readOrder(id) : null;
  if (!order) return Response.json({ error: "No such order." }, { status: 404 });
  return Response.json(order, { headers: { "Cache-Control": "no-store" } });
}
