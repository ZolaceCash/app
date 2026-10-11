# Zolace: the token contract

The contract is written and tested (11 Oct 2026). It is NOT audited and NOT deployed, on testnet or anywhere.
The token is stage 5 of PLAN.md and stays behind an audit and a legal review; neither has been done.

What the owner decided is in PLAN.md ("What it is"). The open choices were left to Claude ("decide what is
best in your view, then build the contract") and are listed under "Choices made" with the reason for each.
The owner can still change any of them before deployment; after it, most of them are fixed for good.

## What is on the chain

Decided by the owner:

- The token is on Robinhood Chain.
- It takes a fee on each transfer. The fee goes to the payout.
- The payout is shielded ZEC, sent by the owner. A wallet needs at least 3,000,000 tokens to be paid.

What follows from that: one contract, the token. The payout is not on this chain, so there is no payout
contract, no claim contract, no registry and no staking. Counting who holds 3,000,000 tokens is done from the
chain's public data, off the chain. A holder's shielded address is given with a signature, off the chain.

The less there is on the chain, the less there is to audit and the less a holder's payout can be read from
it. That is the reason not to add a second contract, not only the cost.

## The chain

Read from Robinhood's own docs (docs.robinhood.com/chain) on 11 Oct 2026.

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain id | 4663 | 46630 |
| Public RPC (rate limited) | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer (Blockscout) | `robinhoodchain.blockscout.com` | `explorer.testnet.chain.robinhood.com` |
| Gas | ETH | ETH |

It is an Arbitrum Nitro layer 2, EVM compatible; Foundry and Hardhat work unchanged, and contracts are
verified on Blockscout. The docs recommend a provider with an archive endpoint for historical reads. What
differs from Ethereum and matters here:

- `block.number` inside a contract is an estimate of the Ethereum block, not this chain's. The contract
  does not use it. Counting holdings is done outside the contract, by this chain's own block numbers as the
  RPC reports them.
- The sequencer screens transactions: one tied to a sanctioned address is never included. No contract can
  change that. A transfer that is left out simply never happened.
- Ordering is first come, first served. Paying more gas does not move a transaction forward.
- The protocol is governed by a council of eight signers (Robinhood holds two seats); routine changes need
  six of eight and wait seven days.
- Listed by the docs as built on the chain: Uniswap (public exchange), LayerZero (bridge), Chainlink
  (oracles), Morpho (lending). WETH is `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.

## What is built

`contracts/` is a package of its own, apart from the site: its own `package.json`, Hardhat 3, OpenZeppelin
Contracts 5.6.1 (pinned), solc 0.8.34. Nothing in it is imported by the app, and the site's type check and
lint leave it alone.

- `contracts/src/ZolaceToken.sol`: the token. About a hundred lines on top of OpenZeppelin's `ERC20` and
  `Ownable2Step`.
- `contracts/test/ZolaceToken.t.sol`: 28 tests, one claim each, two of them run on random inputs.
- `contracts/test/ZolaceToken.invariant.t.sol`: random sequences of transfers and of the owner changing
  every rule the owner can change, with four things checked after each call.

Commands: `npm run test:contract` from the project folder, or `npm test` and `npm run build` inside
`contracts/` (after `npm install` there). No network is configured and there is no deploy script: deploying
is step C2, and it needs the owner's wallet.

The contract as it stands:

- Name "Zolace", symbol "ZOLACE", 18 decimals.
- 1,000,000,000 tokens, minted once in the constructor to the owner's wallet. No function mints more, and
  none burns.
- The fee is in basis points, at most 100 (1%), a constant in the code. The constructor takes the starting
  fee, the owner's address and the fee collector's address.
- A transfer becomes two movements: the fee to the fee collector, the rest to the receiver. The fee is
  rounded down, so a transfer too small for the fee to reach one unit pays none.
- No fee when the sender or the receiver is on the fee-free list, or is the fee collector. The owner's
  wallet is on the list from the start, so the supply can be handed out; the owner can take it off.
- `feeOn(from, to, value)` tells anyone what a transfer would pay.

What the owner's key can and cannot do. The site has to say this in the same plain way once the token is
shown:

| Can | Cannot |
| --- | --- |
| Lower the fee, down to zero | Raise it, ever, or bring it back from zero |
| Change the fee collector | Mint tokens |
| Add or remove a fee-free address | Stop transfers |
| Hand over ownership (two steps), or give it up | Block a wallet, or move anyone's tokens |

Giving up ownership freezes the fee, the collector and the list as they are.

What the tests prove (32 pass):

- All balances together always equal the supply, and the supply never changes, whatever calls are made.
- A transfer moves the amount less the fee to the receiver and exactly the fee to the fee collector, through
  `transfer` and through `transferFrom`, which also spends the whole allowance.
- A fee-free address pays nothing, as sender and as receiver, and pays again once it is off the list.
- The fee cannot be raised or kept, by anyone, and cannot pass the ceiling at deployment.
- Only the owner can call the owner's functions, and ownership moves in two steps.
- The edges: a transfer of zero, to oneself, of a whole balance, of more than the balance or the
  allowance, and of an amount too small for a fee.

The tests were also turned against themselves: the contract was broken on purpose in three ways (a fee that
can go back up, a receiver paid in full on top of the fee, a fee-free receiver that is charged), and each
time tests failed.

## Choices made

By Claude, at the owner's request, on 11 Oct 2026.

| Choice | Chosen | Why |
| --- | --- | --- |
| Supply | 1,000,000,000, fixed | A round number that makes the floor readable: 3,000,000 is 0.3% of it, so at most 333 wallets can qualify at once |
| Symbol | ZOLACE | The name itself. Whether another token uses it was not checked |
| Fee | 1% at most, and it starts there | A fee on every transfer is already hard on exchanges and wallets; a low one does the least damage |
| Can the fee change | Downward only | A holder can know the worst case for good. The owner keeps a way to lower or end it |
| Which transfers pay | Every transfer | The owner's words. Telling trades from plain transfers needs a list of pools that somebody has to keep right |
| How the fee becomes ZEC | It collects in the token; the owner sells it by hand | A swap inside a transfer ties the token to one exchange and is the usual place such tokens break |
| Upgradeable | No | What is deployed is what holders get, and the audit covers all of it |
| Who holds the owner's key | A multisig if one is deployed on the chain, else a hardware wallet | The contract takes any address, so this is settled at deployment. Never a key on the server |
| How the 3,000,000 are counted | The lowest balance a wallet had in the period | One counted block can be met by buying just before it and selling just after |
| How the payout is split | By that lowest balance, among wallets that qualify and have registered | It is what PLAN.md read from the owner's words, and an equal share per wallet can be gamed by splitting tokens |
| A wallet that qualifies and did not register | Gets nothing for that period; the period is split among those that did | There is no address to pay it to, and holding money back for it means keeping a ledger of debts |
| A period | One calendar month, in UTC | Long enough that the lowest balance means something, short enough to wait for |
| The line per period | Published | The blocks, the fee collected, the ZEC paid in total, the number of wallets. It names nobody |

Not chosen, because it cannot be chosen from here:

- The share of each order that goes to the payout. It depends on what the shop earns on each item, and no
  item has a supplier or a price yet. The contract does not need it.
- Who gets the supply after it is minted to the owner's wallet (a sale, an exchange pool, anything kept
  back). That is where the legal review bites hardest, and it is the owner's to decide with that review.

## Counting the 3,000,000 tokens

Not built. It happens off the chain, from data anyone can read, so anyone can do the same sum.

A script reads the token's `Transfer` events through an archive endpoint and rebuilds each wallet's balance
over the month. A wallet counts with the lowest balance it had in that month; one that dipped under
3,000,000 at any time is out for that month. A wallet's share of the payout is its lowest balance over the
sum of the lowest balances of every wallet that qualifies and has registered.

Tokens that sit in an exchange pool belong to the pool's address, not to the person who put them there. They
do not count for that person. The fee collector and the owner's wallet are left out of the count.

## Registering a shielded address

Not built.

- The holder signs one typed message (EIP-712): the wallet, the shielded address, the time. A signature is
  not a transaction: no gas, nothing on a chain.
- The server checks that the signature is that wallet's. A wallet that is itself a contract is checked by
  asking it (ERC-1271), which is a read.
- Stored: the wallet, the shielded address, the signature, the time. A newer signature replaces the older
  one; a signed request removes it. It is a new table, so `/proof` has to list every column of it, and the
  test that guards that page fails until it does.
- Only shielded addresses are accepted. A transparent Zcash address would put the payout in public.
- The page that talks to a wallet is the only one that loads wallet code, and it talks to the wallet in the
  browser directly. No connection service that sits between the site and the wallet: it would see every
  holder who registers. A holder can also sign elsewhere and paste the signature.
- What registering shows the server: that wallet, that shielded address, and the IP address of the request.
  The site says so on the page.

## A month, step by step

All of it is the owner's work. The server can prepare the list; it signs and sends nothing.

1. Close the month at one of this chain's blocks.
2. The fee side: what the fee collector received is public. The owner sells it and turns it into ZEC. Where
   that can be done was not checked, and wherever it is done, it ties the owner's wallet to that place.
3. The shop side: the share of the month's orders, from the shop's own records. Nobody outside can check
   it, because orders are shielded.
4. From the chain and the registrations: which wallets qualify, and each one's share. This is the payout
   list.
5. The owner sends the list in shielded ZEC from the owner's own wallet. One Zcash transaction can pay
   several addresses.
6. The site publishes one line for the month.

## Order of work

| Step | Work | Done when | State |
| --- | --- | --- | --- |
| C0 | The choices and the numbers | Every choice has an answer | Done, except the two under "Not chosen" |
| C1 | The contract and its tests | The tests pass | Done: 32 pass |
| C2 | Deploy on testnet (46630), verify on Blockscout, and try the token where it has to live: an exchange pool, a bridge | A transfer, a trade and a fee-free move all end with the right amounts | Needs the owner's testnet wallet |
| C3 | The counting script and the registration page against testnet, and a practice payout on Zcash testnet | A practice month runs from the closing block to ZEC arriving | After stage 0 of PLAN.md: it needs a Zcash wallet too |
| C4 | The audit, and the legal review | Both are done and what they found is fixed | Not started |
| C5 | Deploy on mainnet with the owner's key, verify, set `TOKEN_ADDRESS` in `lib/token.ts` | The site shows the contract address | Not before C4 |

The deploying key is the owner's and stays with the owner. It is never put in this repository, in an
environment variable of the server, or anywhere the server can read.

## Needed from the owner

1. A yes, or a change, to each line of "Choices made". The supply, the symbol and the ceiling of the fee
   cannot be changed after deployment.
2. The share of each order that goes to the payout.
3. Who gets the supply at the start.
4. For C2: a wallet on Robinhood Chain testnet, with testnet ETH.

## Risks of this part

- The payout is not enforced by anything. The contract takes the fee; turning it into ZEC and sending it is
  the owner's promise.
- A token with a fee on transfers is refused or mishandled by some exchanges, bridges and lending markets.
  What arrives is less than what was sent, and code that assumes otherwise breaks.
- The chain's sequencer leaves out transactions tied to sanctioned addresses, and one company's council can
  change the chain. A token whose holders are paid in a privacy coin sits on that chain at its operator's
  tolerance. The chain's terms of service were not read.
- Whoever holds the owner's key can redirect the fee and choose who pays none.
- Selling the collected fee each month is selling the token in public.
- A token that pays holders a share of fees and of a shop's takings can count as a regulated instrument, and
  paying it out in a privacy coin adds to that. No legal review has been done.
- The contract has been read by nobody but its author. Tests show what was thought of.

## Not checked

- The chain's terms of service, and which countries are shut out.
- Which EVM version the chain runs. The contract is compiled for "cancun" (`contracts/hardhat.config.ts`);
  confirm it on testnet.
- Whether Safe (or another multisig) is deployed on the chain.
- How Uniswap on this chain treats a token with a fee on transfers, and which version it is.
- Whether the symbol ZOLACE is in use elsewhere.
- A way from ETH on this chain to ZEC, and what it costs.
- What an archive endpoint costs for the counting script.
