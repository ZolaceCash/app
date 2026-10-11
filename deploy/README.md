# Putting Zolace on a server

One server, Docker Compose, three containers:

| Container | What it does |
| --- | --- |
| `app` | The site (Next.js), built from the `Dockerfile`. Its database is one SQLite file on the `zolace-data` volume |
| `nginx` | Takes HTTPS on port 443 and hands requests to the site. No access log |
| `certbot` | Gets and renews the certificate from Let's Encrypt, proving the domain through Cloudflare's DNS |

Cloudflare sits in front of the server: visitors talk to Cloudflare, Cloudflare talks to nginx. The
domain is `zolace.cash`.

Only test orders exist. Nothing in this setup takes a real payment: the payment engine is not part of it.

## What Cloudflare costs in privacy

Cloudflare ends the visitor's HTTPS connection and opens its own to this server. So Cloudflare sees every
request in the clear: the visitor's address, which pages they open, and an order's link without the part
after `#` (a browser never sends that part to anyone). This server writes no visitor address anywhere, and
nginx does not pass it on to the site; Cloudflare keeps logs of its own, under its own rules.

That is a third party the site's texts have to name. They do: "the network in front of it".

## Before the first start

1. A server with Docker and the Compose plugin, and ports 80 and 443 open.
2. The DNS of `zolace.cash` at Cloudflare, with two proxied records pointing at the server: `zolace.cash`
   and `www.zolace.cash`.
3. In Cloudflare, SSL/TLS mode **Full (strict)**. With "Flexible", Cloudflare would talk to this server
   without encryption.
4. A Cloudflare API token that can edit the DNS of this one zone (My Profile > API Tokens > Create Token >
   "Edit zone DNS", limited to `zolace.cash`). Certbot uses it to prove the domain is yours.

## First start

Everything a deployment needs to be told is in one file, `.env`, beside `docker-compose.yml`. It is the
only file with secrets in it and it is never committed.

```bash
cp deploy/env.example .env
chmod 600 .env
```

| Setting | What it is |
| --- | --- |
| `DOMAIN` | `zolace.cash` |
| `CERTBOT_EMAIL` | Where Let's Encrypt writes when a certificate is about to run out |
| `CLOUDFLARE_API_TOKEN` | Secret. The token from step 4 above |
| `OWNER_SECRET` | Secret. Opens `/owner`. 32 characters or more: `openssl rand -base64 48` |
| `ORDER_RETENTION_DAYS` | Days an order is kept after it closes |
| `TOKEN_ADDRESS` | The token's contract address (the CA) shown across the site. Empty until there is a token |
| `TOKEN_CHAIN_ID`, `TOKEN_RPC_URL`, `TOKEN_DEPLOY_BLOCK` | The token's network, where the site reads it, and the block the contract was deployed in |
| `VAULT_ADDRESS` | The vault's contract address. Empty until it is deployed: the vault stays closed |
| `REWARD_ASSET`, `REWARD_SYMBOL`, `REWARD_DECIMALS` | What holders are rewarded in. Set to NVDA on Robinhood Chain; it has to be on the token's network |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Only for a hosted database. Left out, the database is the local file |

Fill it in, then:

```bash
sh deploy/init-cert.sh
docker compose up -d --build
```

`init-cert.sh` gets the first certificate and agrees to Let's Encrypt's subscriber agreement in your name.
It is run once. After that the `certbot` container looks twice a day and renews when a certificate has
under 30 days left, and nginx reloads twice a day to pick a new one up.

The site makes its own tables and puts the three test items on the shelf the first time it is opened.

Then check what the server can reach:

```bash
sh deploy/preflight.sh
```

It asks, from inside the site's container, for the two ZEC prices an order needs, for the token's network,
and whether the settings read as meant. It changes nothing and prints no secret. Run it on the server
itself, not on a laptop: some networks answer for an exchange's or a chain's host with an address of their
own, and a site behind one starts, looks fine and cannot price a single order. If a line fails for that
reason, the fix is the server's network or its DNS, not the site.

## On Coolify

Coolify brings its own proxy, which takes the domain and the certificate. So on Coolify use
`docker-compose.coolify.yml`, not `docker-compose.yml`: it has the site and nginx, no certbot, and
publishes no port. `init-cert.sh`, the Cloudflare token and the `.env` file are not used.

1. New resource from the repository, build strategy **Compose**, Docker Compose Location
   `/docker-compose.coolify.yml`.
2. **Domains**: add the domain on the service `web`, with its port: `https://zolace.cash:80`, and
   `https://www.zolace.cash:80` beside it if www should answer (it is sent on to the bare name). Not on `app`:
   `web` is the nginx that strips the visitor's address before a request reaches the site.
3. **Environment Variables**: every setting of the compose file is listed there. `OWNER_SECRET` has to be
   filled in before Coolify deploys (32 characters or more: `openssl rand -base64 48`). The rest start with
   working values; `TOKEN_ADDRESS` and `VAULT_ADDRESS` start empty.
4. Deploy. Then open the **Terminal** of the `app` container and run `node preflight.mjs`: it checks the
   two ZEC prices, the token's network and the settings, as `deploy/preflight.sh` does elsewhere.

To show or change the contract address later: set `TOKEN_ADDRESS` under Environment Variables and redeploy.

Two things Coolify decides and this repository cannot:

- Its proxy may keep an access log, with every visitor's address in it. Look at the server's **Proxy**
  configuration; if it has `accesslog` lines, take them out and restart the proxy. The site's own pages say
  only that the app and its nginx keep none, and that the host in front may.
- The database is the volume `zolace-data`. It outlives a redeploy, and it is gone if the resource is
  deleted with its volumes. Back it up as under "The database".

Tried on 11 Oct 2026 without Coolify itself: this compose file was built and run with a local port in
place of Coolify's proxy, and every page, a whole test order, the owner's screens and the check above
passed. The steps in Coolify's own screens were written from its documentation and not run.

## The database

It is local, and Docker Compose sets it up: `docker-compose.yml` gives the site
`DATABASE_URL=file:/app/data/zolace.db`, one SQLite file on the `zolace-data` volume. The site opens that
file itself, so there is no database container and no network between the site and its data. Everything
runs on the one server.

```bash
# A copy of the database, written beside docker-compose.yml.
docker compose exec app node -e "require('fs').copyFileSync('/app/data/zolace.db','/app/data/backup.db')"
docker compose cp app:/app/data/backup.db ./zolace-backup.db
```

Orders are deleted some days after they close, so a backup holds what the site holds and for longer than
the site would: keep backups as short a time as the orders themselves.

To use a hosted libSQL database instead, set `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in `.env`. The orders
are then stored with that provider.

## The owner's screens

`OWNER_SECRET` in `.env` turns `/owner` on. Without it, or with fewer than 32 characters, the screens stay
switched off. Changing it and restarting ends every session:

```bash
docker compose up -d app
```

## The contract address (CA), and the vault

The site launches without a token: `TOKEN_ADDRESS` is empty, and every page that speaks of the token says
there is none. The shop does not depend on it.

To show a contract address, put it into `.env` and restart the site. Nothing is built again:

```bash
# in .env
TOKEN_ADDRESS=0x...
```

```bash
docker compose up -d app
```

That one setting changes the slot on the home page (with its copy button), the token block under it, the
token page of the docs, the whitepaper, the roadmap and the vault page, all at once. With an address set
they say the token is on the chain, not audited and not reviewed; they never say more than that. Clearing
the line and restarting takes it back. `TOKEN_CHAIN_ID` is 4663 for Robinhood Chain.

The vault (the holders' reward) is a second switch and can come later: it stays closed, and the owner's
payout screen stays switched off, until `VAULT_ADDRESS` is set as well (`CONTRACT.md`). Then also set
`TOKEN_DEPLOY_BLOCK` to the block the token was deployed in.

Counting a month of holdings reads the token's transfers back to its first block. The public endpoint was
tried on 11 Oct 2026: it serves old blocks and old transfers, at most 10,000 transfers or 10,000,000 blocks
per request, and it answers "too many requests" when asked quickly. The site cuts a stretch in two when it
is too large and waits when it is asked to, so the public endpoint works for a token with a modest history
and gets slow for a busy one. A provider's endpoint in `TOKEN_RPC_URL` avoids the waiting. Old balances (an
archive) are not needed: the count is made from transfers alone.

The site only reads the chain. It holds no key for it: a month is funded from the owner's own wallet, in the
browser, on `/owner/payout`, and a holder claims from theirs on `/vault`. Both need a wallet in that browser.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations in `drizzle/` are applied when the new version first opens the database.

## Closing the side door

Cloudflare only protects what goes through it. Someone who knows the server's address can talk to nginx
directly, and the limits on new orders and on sign-in attempts do not count such requests. Close ports 80
and 443 to everyone but Cloudflare in the server's firewall (the ranges are at cloudflare.com/ips), or turn
on Cloudflare's "Authenticated Origin Pulls" and have nginx ask for Cloudflare's certificate.

## Not in here

- The payment engine. It is not wired into the site (`engine/cipherpay/README.md`): the shop takes test
  orders only, and no real payment. When the engine is wired in, it gets a container of its own that only
  the site can reach.
- A Tor mirror.
- Backups on a schedule.
