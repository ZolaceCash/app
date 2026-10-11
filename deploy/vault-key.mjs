// Makes a signing key for the vault and prints it, once, to this terminal only.
//
//   node deploy/vault-key.mjs      in the project folder, on your own machine
//
// The key goes into VAULT_SIGNER_KEY where the server runs. The address goes to the vault's
// contract as its signer: when the contract is deployed, or later from the owner's payout screen.
// Nothing is written to a file and nothing is sent anywhere. The key holds no funds: its address
// needs no ETH and should never be sent anything.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const key = generatePrivateKey()
console.log(`VAULT_SIGNER_KEY=${key}`)
console.log(`The signer's address, for the vault: ${privateKeyToAccount(key).address}`)
console.log("Keep the first line secret. Close this terminal when it is copied.")
