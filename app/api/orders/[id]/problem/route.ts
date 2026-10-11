import { PROBLEM_MAX, PROBLEM_MIN } from "@/lib/order-times";
import { reportProblem } from "@/lib/orders";

const MESSAGE = {
  "no-order": "No such order.",
  "not-delivered": "Only an order whose item was handed over, for real coins, can be reported.",
  answered: "This report has been answered already.",
  "bad-note": `Say what is wrong in ${PROBLEM_MIN} to ${PROBLEM_MAX} characters.`,
  "bad-address":
    "That is not a shielded Zcash address of this network, or a character in it is wrong. Give a unified address (u1...) or a Sapling address (zs1...), copied whole.",
} as const;

// The buyer says the item they were handed does not work. Whoever holds the order's link can do
// this, as with everything else about an order: there is no account to check against.
export async function POST(request: Request, context: RouteContext<"/api/orders/[id]/problem">) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { note?: unknown; address?: unknown } | null;
  if (id.length > 40 || !body || typeof body.note !== "string" || body.note.length > 4 * PROBLEM_MAX) {
    return Response.json({ error: MESSAGE["bad-note"] }, { status: 400 });
  }
  if (typeof body.address !== "string" || body.address.length > 700) {
    return Response.json({ error: MESSAGE["bad-address"] }, { status: 400 });
  }

  const result = await reportProblem(id, body.note, body.address);
  if (!result.ok) {
    const status = result.reason === "no-order" ? 404 : result.reason === "not-delivered" || result.reason === "answered" ? 409 : 400;
    return Response.json({ error: MESSAGE[result.reason] }, { status });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
