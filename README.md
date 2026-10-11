# Zolace

A shop for digital goods that needs no account and is paid in shielded Zcash. This repository is the site.

**This is a preview.** Only test orders run: the payment is a button and the items are made up. No real
payment is taken and nothing real is sold. Nothing here has been audited and no legal review has been done.
A token is planned, with a monthly reward for its holders paid in NVDA from a contract; none exists, and
nothing in this repository is an offer of one.

## How an order works

- Checkout asks for nothing. An order is a link, and the link is the receipt.
- The link has two halves. The part after `#` is a secret that a browser never sends to a server.
- The item is encrypted to a key the buyer's browser made. After delivery the server keeps ciphertext only.
- The server is meant to hold a Zcash viewing key and nothing that can move funds.

The site explains itself in more detail at `/docs`, `/whitepaper` and `/roadmap`, and lists every column it
stores at `/proof`.

## What is in here

| Path | What |
| --- | --- |
| `app/`, `components/`, `lib/` | The site: Next.js 16, SQLite through drizzle |
| `tests/` | Tests of the order flow, the sealing of an item, the price rule, the owner's screens and the vault's counting |
| `contracts/` | The token and the vault its holders claim from, with their tests. Written, not audited, not deployed (`CONTRACT.md`) |
| `engine/cipherpay/` | A patch and notes from trying a payment engine on Zcash testnet |
| `Dockerfile`, `docker-compose.yml`, `deploy/` | Running it on one server (`deploy/README.md`) |

## Running it

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`. The database is one SQLite file under `data/`, made on first use, with
three test items on the shelf.

```bash
npm test
```

The owner's screens at `/owner` are switched off until `OWNER_SECRET` is set to a secret of 32 characters or
more, for example in `.env.local`.

The contracts are a package of their own:

```bash
cd contracts && npm install && npm test
```

## Licence

No licence has been chosen yet.
