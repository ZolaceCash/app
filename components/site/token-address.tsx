import { connection } from "next/server"
import { Suspense } from "react"

import { ContractAddress } from "@/components/site/contract-address"
import { tokenConfig } from "@/lib/token"

// The contract address as the server knows it right now. It is read when the page is asked for,
// not when the site is built, so setting TOKEN_ADDRESS on the server is all a launch takes here.
async function Current() {
  await connection()
  return <ContractAddress address={tokenConfig().address} />
}

export function TokenAddress() {
  return (
    <Suspense fallback={<ContractAddress address={null} pending />}>
      <Current />
    </Suspense>
  )
}
