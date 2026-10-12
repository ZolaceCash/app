import { connection } from "next/server";

import { rateNow } from "@/lib/price";

// What a ZEC costs in dollars right now, as the shop's two sources have it (lib/price.ts). An
// item's page asks this to say about what its price is in ZEC. The browser asks the shop, so it
// never has to call an exchange itself. The answer is the same for everyone and says nothing
// about who asked: the request names no item and no order.
export async function GET() {
  await connection();
  const rate = await rateNow();
  return Response.json(rate, { headers: { "Cache-Control": "no-store" } });
}
