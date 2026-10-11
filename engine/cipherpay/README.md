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
- `Dockerfile`: CipherPay's own, with two fixes. Its Rust image was too old for its dependencies, and its
  dependency-caching step left an empty program in the final image.
- `cipherpay.env.example`: its settings.

## Building and running it

```bash
git clone https://github.com/atmospherelabs-dev/cipherpay-api.git && cd cipherpay-api
git checkout f6f022d
git apply /path/to/engine/cipherpay/nu7.patch
git apply /path/to/engine/cipherpay/watch.patch
rm Cargo.lock
docker build -f /path/to/engine/cipherpay/Dockerfile -t zolace-engine .
docker run -d --name zolace-engine --env-file cipherpay.env \
  -p 127.0.0.1:3080:3080 -v zolace-engine-data:/data zolace-engine
```

Then register a viewing key once (`POST /api/merchants` with `{"ufvk": "uview1..."}`; the answer holds the
API key, shown that one time). Give the shop where the engine is and that key:

```
CIPHERPAY_URL=http://127.0.0.1:3080
CIPHERPAY_API_KEY=cpay_...
PAYMENT_NETWORK=mainnet            # or testnet
CIPHERSCAN_API_URL=https://api.mainnet.cipherscan.app
```

With all of `CIPHERPAY_URL`, `CIPHERPAY_API_KEY` and `PAYMENT_NETWORK` set the shop takes real payments;
with one missing it takes test orders. The viewing key is all the engine is given: it can see payments and
cannot spend them. The seed stays with the owner, offline.

Keep the engine's port bound to the server itself. On testnet it makes invoices for anyone who can reach
it, without a key.

## What was run

- 11 Oct 2026, stage 0: a faucet payment to an invoice's address on testnet, seen only with `nu7.patch`.
- 11 Oct 2026, through the shop: the engine built with both patches, an order placed on the site in a
  browser, its address paid from a public testnet faucet with far more than the price. The order went
  from waiting to seen in under a minute, to confirmed, and was handed over at three blocks; the item
  opened in the browser, and the excess was put on the owner's refund queue.
- Not run: a second payment to a paid invoice against the real engine (the faucet pays once a day; the
  shop's side of it is tested against a played engine in `tests/payment.test.ts`), a payment after the
  price lock, and anything on mainnet.

## Things to know before real money

- After a stop, the engine reads the blocks it missed before it calls itself healthy: about two minutes per
  hundred blocks here. The shop starts no order until then.
- It reads the chain through CipherScan, a block explorer run by others. CipherScan learns which
  transactions pay this shop, though not the amounts or the addresses.
- An engine that falls behind a network upgrade drops payments in silence. Its health does not show that.
  A known payment sent on a schedule would; it is not built.
