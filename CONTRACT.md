# Zolace: the token and the vault

Two contracts are written and tested (11 Oct 2026): the token, and the vault its holders claim a reward
from. Neither is audited and neither is deployed, on testnet or anywhere. The token is stage 5 of the plan
and stays behind an audit and a legal review; neither has been done.

The open choices were left to Claude ("decide what is best in your view, then build the contract") and are
listed under "Choices made" with the reason for each. The owner can still change any of them before
deployment; after it, most of them are fixed for good.

## What is on the chain

Decided by the owner:

- The token is on Robinhood Chain.
- It takes a fee on each transfer. The fee goes to the reward.
- A wallet needs at least 3,000,000 tokens to be rewarded.
- The reward is NVDA, Robinhood's stock token for NVIDIA on the same chain:
  `eip155:4663/erc20:0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`. Read back from the chain on 11 Oct 2026:
  name "NVIDIA • Robinhood Token", symbol NVDA, 18 decimals.

Before that day the reward was to be shielded ZEC, sent by the owner by hand, with no contract and nothing
of a payout on any public chain. The owner replaced that. What changed with it:

- There are two contracts now, the token and the vault. A contract holds each month's reward, and anyone
  can read what went in and what was claimed.
- Every claim is public for good: its wallet, its amount, its time. So is each month's whole list. The
  reward borrows nothing from the privacy of the shop's payments, and no text may suggest it does.
- Nothing is registered. A holder gives the site nothing; the old table of shielded addresses is gone.
- NVDA is another company's security token. That is a legal question of its own (see "Risks").

Counting who holds 3,000,000 tokens is still done off the chain, from the chain's public data. No staking
and no registry: holding is enough.

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
- `contracts/src/ZolaceVault.sol`: the vault. About a hundred lines on top of OpenZeppelin's `Ownable2Step`,
  `SafeERC20` and `MerkleProof`.
- `contracts/test/ZolaceVault.t.sol`: 20 tests, two of them run on random inputs, one of them held to the
  same numbers as the site's own test.

What was run on 11 Oct 2026, to see the pieces work together: both contracts and a stand-in for NVDA
deployed on a local chain that started in August, six wallets holding through September (one dipping under
the minimum and coming back, one buying in the month, one ending a single token under the line), and the
site running from `docker-compose.yml` behind nginx. In a browser, with a stand-in wallet that passed
requests to that chain: the owner's screen listed the two wallets that held throughout, 9 to 5 as they
held; recording the month before it was funded was refused; the owner funded 14 from the owner's wallet and
recorded it; each of the two wallets claimed its part on the vault page (9 and 5) and the vault was left
with nothing; the three other wallets were told they were on no list; and no request to the site named a
holder's wallet. Not run: anything on Robinhood Chain or its testnet, a real wallet, the real NVDA token.

Commands: `npm run test:contract` from the project folder, or `npm test` and `npm run build` inside
`contracts/` (after `npm install` there). No network is configured and there is no deploy script: deploying
is step C2, and it needs the owner's wallet.

The token as it stands:

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

What the token's tests prove (32 pass):

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

### The vault

- The constructor takes the owner's address and the reward token's address. The reward token cannot be
  changed afterwards.
- A month is a number like 202609. `fund(month, root, total)` is the owner's: it pulls `total` of the reward
  from the owner's wallet into the contract and keeps `root`, one hash that stands for the month's list.
- A month is funded once. It cannot be funded again, topped up, changed or taken back.
- `claim(month, wallet, amount, proof)` pays `amount` to `wallet` if that line belongs under the month's
  root and was not paid before. Anyone may send it; the reward only ever goes to the wallet on the list, so
  a wallet that cannot send transactions itself can be claimed for.
- A month never pays more than was put in for it, whatever its list says: a list that adds up to more
  cannot reach another month's reward.
- A reward token that keeps part of a transfer for itself is refused when a month is funded.

| The vault's owner can | Cannot |
| --- | --- |
| Fund a month that has not been funded | Withdraw anything, ever |
| Hand over ownership (two steps), or give it up | Change or cancel a funded month |
| | Stop claims, block a wallet, or claim for itself |

Giving up ownership ends funding and leaves every funded month claimable. A part nobody claims stays in the
contract for good: there is no deadline and no sweep. That is the price of the owner having no way to take
money out.

What the vault's tests prove (20 pass): funding moves exactly the total in and only the owner can do it; a
month cannot be funded twice or with nothing; a listed wallet gets exactly its part, once; another amount,
another wallet, another month's proof or a made-up proof gets nothing; a list that promises more than went
in cannot touch another month; and the contract hashes a list the way the site does
(`tests/vault.test.ts` holds the site to the same two numbers).

## Choices made

By Claude, at the owner's request, on 11 Oct 2026.

| Choice | Chosen | Why |
| --- | --- | --- |
| Supply | 1,000,000,000, fixed | A round number that makes the floor readable: 3,000,000 is 0.3% of it, so at most 333 wallets can qualify at once |
| Symbol | ZOLACE | The name itself. Whether another token uses it was not checked |
| Fee | 1% at most, and it starts there | A fee on every transfer is already hard on exchanges and wallets; a low one does the least damage |
| Can the fee change | Downward only | A holder can know the worst case for good. The owner keeps a way to lower or end it |
| Which transfers pay | Every transfer | The owner's words. Telling trades from plain transfers needs a list of pools that somebody has to keep right |
| How the fee becomes NVDA | It collects in the token; the owner sells it and buys NVDA by hand | A swap inside a transfer ties the token to one exchange and is the usual place such tokens break |
| Upgradeable | No | What is deployed is what holders get, and the audit covers all of it |
| Who holds the owner's key | A multisig if one is deployed on the chain, else a hardware wallet | The contract takes any address, so this is settled at deployment. Never a key on the server |
| How the 3,000,000 are counted | The lowest balance a wallet had in the period | One counted block can be met by buying just before it and selling just after |
| How the reward is split | By that lowest balance, among wallets that qualify | An equal share per wallet can be gamed by splitting tokens |
| How a holder is paid | The wallet claims from a contract, against a list hashed into one root | Sending to every wallet costs the owner gas per holder and needs a key that sends; a claim needs neither. The server never holds such a key |
| Can the owner take a month back | No, not even what nobody claims | A way out for the owner is a way out for whoever takes the owner's key. Unclaimed reward staying put is the cost |
| Who is left out | The token's owner, its fee collector, the vault, and whatever wallets the owner names | The project must not pay itself. A pool or a bridge holds other people's tokens and could never spend what it is paid |
| A period | One calendar month, in UTC | Long enough that the lowest balance means something, short enough to wait for |
| The list per period | Published whole | It has to be: a wallet needs the list to prove its line, and anyone needs it to check the root |

Not chosen, because it cannot be chosen from here:

- The share of each order that goes to the reward, and how much NVDA goes into a month. It depends on what
  the shop earns on each item, and no item has a supplier or a price yet. The contracts do not need it.
- Who gets the supply after it is minted to the owner's wallet (a sale, an exchange pool, anything kept
  back). That is where the legal review bites hardest, and it is the owner's to decide with that review.

## Counting the 3,000,000 tokens

Built (`lib/vault.ts`, `lib/vault-chain.ts`, `lib/vault-store.ts`), and used by the owner's screen at
`/owner/payout`. It happens off the chain, from data anyone can read, so anyone can do the same sum.

The site reads every `Transfer` event of the token, from the block the contract was deployed in, and
rebuilds each wallet's balance over the month. It finds the month's first and last block by their times. A
wallet counts with the lowest balance it had in that month; one that dipped under 3,000,000 at any time is
out for that month, and one that arrived during the month started it with nothing. A wallet's part is its
lowest balance over the sum of the lowest balances of every wallet that qualifies, rounded down to a whole
unit of the reward, so a list never promises more than goes in.

Tokens that sit in an exchange pool belong to the pool's address, not to the person who put them there. They
do not count for that person. The owner's screen marks a listed address that is a contract; the owner
decides whether to leave it out.

## The vault on the site

Built: `/vault` (`app/vault/page.tsx`, `components/vault/`), `/api/vault/months`, and the owner's screen. It
is closed until `TOKEN_ADDRESS` and `VAULT_ADDRESS` are set where the server runs, and opens by itself when
they are. The reward is `REWARD_ASSET`, NVDA by default; it has to be on the token's network.

- The server only reads the chain. It has no key for it. The owner funds a month from the owner's wallet,
  and a holder claims from theirs.
- `/api/vault/months` gives every funded month with its whole list, the same answer for everyone. A
  holder's browser finds its own line in it and builds its own proof, so the server is not asked about a
  wallet and does not learn who looked.
- Whether a line was already claimed is asked of the chain through the holder's wallet. The claim is a
  transaction that wallet sends.
- The page talks to the wallet in the browser directly. No connection service sits between the site and
  the wallet: it would see every holder who claims.
- A month is recorded on the site only if the vault's contract holds that very root and that very total.
  What the page lists is then what the contract pays.
- Stored: one row per funded month (`vault_months`): the month, its blocks, the root, the total, and the
  list. `/proof` lists every column, and the test that guards that page fails if one is missing.

## A month, step by step

All of it is the owner's work. The server prepares the list; it signs and sends nothing.

1. The month ends. Its first and last block are found by their times.
2. The fee side: what the fee collector received is public. The owner sells it. Where that can be done was
   not checked, and selling it is selling the token in public.
3. The shop side: the share of the month's orders, in ZEC, from the shop's own records. Nobody outside can
   check it, because orders are shielded.
4. The owner buys NVDA with both. Whether the owner may buy and hold it, and where, is the owner's to
   establish: Robinhood restricts where its stock tokens are offered.
5. On `/owner/payout`: the month, the amount of NVDA, and any wallets to leave out. The screen shows the
   list, the total and the root.
6. The owner funds the month from the wallet that owns the vault: one transaction to let the vault take the
   NVDA, one to hand over the root and the total.
7. The owner records the month. The site checks the contract first. Holders can claim from then on.

## Order of work

| Step | Work | Done when | State |
| --- | --- | --- | --- |
| C0 | The choices and the numbers | Every choice has an answer | Done, except the two under "Not chosen" |
| C1 | The contracts and their tests | The tests pass | Done: 52 pass, 32 for the token and 20 for the vault |
| C2 | Deploy both on testnet (46630), verify on Blockscout, and try the token where it has to live: an exchange pool, a bridge | A transfer, a trade and a fee-free move all end with the right amounts | Needs the owner's testnet wallet |
| C3 | The counting, the owner's screen and the vault page against testnet, with a test token standing in for NVDA | A practice month runs from the last block to a claim arriving in a wallet | Run against both contracts on a local chain, through the site in Docker (11 Oct 2026). Not yet on testnet, and never with a real wallet |
| C4 | The audit of both contracts, and the legal review | Both are done and what they found is fixed | Not started |
| C5 | Deploy on mainnet with the owner's key, verify, set `TOKEN_ADDRESS` and `VAULT_ADDRESS` where the server runs | The site shows the contract address and the vault opens | Not before C4 |

The deploying key is the owner's and stays with the owner. It is never put in this repository, in an
environment variable of the server, or anywhere the server can read.

## Needed from the owner

1. A yes, or a change, to each line of "Choices made". The supply, the symbol and the ceiling of the fee
   cannot be changed after deployment.
2. The share of each order that goes to the reward, and how the amount of a month is decided.
3. Who gets the supply at the start.
4. For C2: a wallet on Robinhood Chain testnet, with testnet ETH.

## Risks of this part

- The contract enforces a month once it is funded. It does not enforce that a month is funded, how much
  goes in, or that the list was counted right: those rest on the owner.
- A wrong list cannot be corrected. A month funded with a mistake stays as it is; the only remedy is the
  owner making it good in a later month.
- A part that is never claimed stays in the vault for good.
- NVDA is Robinhood's token. Its docs describe the stock tokens as tokenised debt securities issued by a
  Robinhood company, not shares, and as not offered in a number of countries. Its contract was not read:
  whether its issuer can freeze it, block an address or change its balances was not checked, and a vault
  that holds a frozen token pays nothing. Its docs also describe a multiplier between the amount a contract
  holds and the amount a wallet shows; the vault and the site count in the contract's own units.
- Handing holders a security token, from a shop's takings and a token's fees, is more likely to be a
  regulated activity than the plan was before. No legal review has been done.
- A token with a fee on transfers is refused or mishandled by some exchanges, bridges and lending markets.
  What arrives is less than what was sent, and code that assumes otherwise breaks.
- The chain's sequencer leaves out transactions tied to sanctioned addresses, and one company's council can
  change the chain. The token, the vault and the reward all sit on that chain at its operator's tolerance.
  The chain's terms of service were not read.
- Whoever holds the token owner's key can redirect the fee and choose who pays none. Whoever holds the
  vault owner's key can fund a month with any list, but cannot take out what is already in.
- Selling the collected fee each month is selling the token in public.
- Both contracts have been read by nobody but their author. Tests show what was thought of.

## Not checked

- The chain's terms of service, and which countries are shut out.
- Which EVM version the chain runs. The contract is compiled for "cancun" (`contracts/hardhat.config.ts`);
  confirm it on testnet.
- Whether Safe (or another multisig) is deployed on the chain.
- How Uniswap on this chain treats a token with a fee on transfers, and which version it is.
- Whether the symbol ZOLACE is in use elsewhere.
- The NVDA token's own contract: who controls it, and what they can do to a holder or to the vault.
- Where the owner can buy NVDA, and whether the owner is allowed to.
- A way from the collected fee and from ZEC to NVDA, and what it costs.
- What an archive endpoint costs for the counting script.
