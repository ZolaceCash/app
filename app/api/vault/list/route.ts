import { connection } from "next/server";

import { tokenConfig, vaultLive } from "@/lib/token";
import { signList } from "@/lib/vault-sign";
import { published } from "@/lib/vault-store";

// Everything a wallet needs to claim: where the vault is, the whole list as it stands after the
// last hour counted, and the signature the vault's contract asks for. It is the same for everyone
// and it is all public, so a holder's browser finds its own line and works out its own proof, and
// the server is never told which wallet is asking.
export async function GET() {
  await connection();
  const config = tokenConfig();
  const headers = { "Cache-Control": "no-store" };
  if (!vaultLive(config)) return Response.json({ live: false, list: [] }, { headers });

  const now = await published();
  return Response.json(
    {
      live: true,
      chainId: config.chainId,
      token: config.address,
      vault: config.vault,
      reward: config.reward,
      hour: now?.hour ?? null,
      root: now?.root ?? null,
      // Null while nobody has earned anything, or while the server has no signing key.
      signature: now?.root ? await signList(config.chainId, config.vault, now.hour, now.root) : null,
      funded: now?.funded ?? "0",
      total: now?.total ?? "0",
      list: now?.list ?? [],
    },
    { headers }
  );
}
