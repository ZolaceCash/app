# CipherPay, as the shop's payment engine

CipherPay itself is not in this repository: it is `atmospherelabs-dev/cipherpay-api` on GitHub (MIT), used
at commit `f6f022d` with the two patches kept here. The shop talks to it through `lib/cipherpay.ts`.

- `nu7.patch`: moves CipherPay to the Zcash libraries that know the NU7 upgrade, and reads each transaction
  with the consensus branch the transaction names instead of assuming NU6.3. Without it CipherPay drops
  every testnet transaction made after NU7, without an error.
- `watch.patch`: makes CipherPay keep watching an invoice after it is paid. Unpatched, it never looks at a
  confirmed invoice again, so a second payment to it is seen by nothing, and a part payment cuts the time
  the invoice is watched down to ten minutes. With the patch a payment to a paid invoice is added to what
  the invoice received (once per transaction), a confirmed invoice is watched for `PAID_WATCH_HOURS` (seven
  days unless set), and a payment never shortens an invoice's life.
- `Dockerfile`: builds the engine from this folder alone. It fetches CipherPay at that commit, applies the
  two patches and compiles with `Cargo.lock`, the dependency versions of the build that was run against
  the chain. The first build takes ten minutes or more and a few gigabytes of memory; later ones come
  from Docker's cache.
- `entrypoint.sh`: starts the engine, or waits and does nothing when it has not been given its
  `ENCRYPTION_KEY`. A server that only takes test orders deploys the same way.
- `register.sh`: gives the engine the shop's viewing key, once, and leaves the key to the engine in a file
  the site reads. It prints neither.
- `cipherpay.env.example`: the engine's settings, for running it by hand.

## In the compose files

Both compose files run it as two services: `engine`, reachable from the site only, and `engine-setup`,
which runs `register.sh` at each start and ends. Three settings switch real payments on (`deploy/README.md`,
"Real payments"): `PAYMENT_NETWORK`, `ENGINE_ENCRYPTION_KEY` and `ZCASH_VIEWING_KEY`. With any of them
missing the shop takes test orders.

The viewing key is all the engine is given, and it stores only the incoming half of it: it can see
payments arrive and cannot spend them. The seed stays with the owner, offline.

`watch.patch` also lifts the engine's limit of one request a second per caller: its only caller is the
shop, and every open order page is a question every few seconds.

## What was run

- 11 Oct 2026, stage 0: a faucet payment to an invoice's address on testnet, seen only with `nu7.patch`.
- 11 Oct 2026, through the shop: the engine built with both patches, an order placed on the site in a
  browser, its address paid from a public testnet faucet with far more than the price. The order went
  from waiting to seen in under a minute, to confirmed, and was handed over at three blocks; the item
  opened in the browser, and the excess was put on the owner's refund queue.
- 11 Oct 2026, the whole stack from the compose file, on testnet: the engine built from this folder, the
  viewing key registered by `engine-setup`, the site's own check passing, an order placed through nginx
  and given an address of its own, and the engine restarted without registering twice or losing the order.
- Not run: a second payment to a paid invoice against the real engine (the faucet pays once a day; the
  shop's side of it is tested against a played engine in `tests/payment.test.ts`), a payment after the
  price lock, a paid order through the compose stack, and anything on mainnet.

## Things to know before real money

- After a stop, the engine reads the blocks it missed before it calls itself healthy: about two minutes per
  hundred blocks here. The shop starts no order until then.
- The engine and the key to it live on two volumes. Remove both or neither: an engine that remembers a
  viewing key refuses to take it again, and the key to the engine is shown only once.
- The site's pages still say "test orders only" in fixed text. Before `PAYMENT_NETWORK=mainnet` they have
  to follow the setting, as the pages about the token follow theirs.
- It reads the chain through CipherScan, a block explorer run by others. CipherScan learns which
  transactions pay this shop, though not the amounts or the addresses.
- An engine that falls behind a network upgrade drops payments in silence. Its health does not show that.
  A known payment sent on a schedule would; it is not built.
