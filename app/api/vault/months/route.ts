import { connection } from "next/server";

import { tokenConfig, vaultLive } from "@/lib/token";
import { listMonths } from "@/lib/vault-store";

// Everything a wallet needs to claim: where the vault is, and every funded month with its whole
// list. It is the same for everyone and it is all public, so a holder's browser works out its own
// proof from it and the server is never told which wallet is asking.
export async function GET() {
  await connection();
  const config = tokenConfig();
  if (!vaultLive(config)) {
    return Response.json({ live: false, months: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    {
      live: true,
      chainId: config.chainId,
      token: config.address,
      vault: config.vault,
      reward: config.reward,
      months: await listMonths(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
