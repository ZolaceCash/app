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
   filled in before Coolify deploys. It is 32 characters or more; make one with `openssl rand -base64 48`, or
   where there is no openssl, `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
   The rest start with
   working values; `TOKEN_ADDRESS` and `VAULT_ADDRESS` start empty.
4. Deploy. Then open the **Terminal** of the `app` container and run `node preflight.mjs`: it checks the
   two ZEC prices, the token's network and the settings, as `deploy/preflight.sh` does elsewhere.

To show or change the contract address later: set `TOKEN_ADDRESS` under Environment Variables and redeploy.

### With the domain at Cloudflare

The site works behind Cloudflare's proxy as it is: the nginx of this compose file counts a flood by the
visitor's address as Cloudflare reports it, strips that address before the request reaches the site, and
sends `www` on to the bare name. Pages are answered with `Cache-Control: no-store`, so Cloudflare does not
keep a copy of an order's page. What has to be set is on Cloudflare's side and on Coolify's proxy:

1. **DNS**: two records pointing at the server, `zolace.cash` and `www`, both **Proxied**.
2. **SSL/TLS > Overview**: **Full (strict)**. With "Flexible", Cloudflare talks to the server without
   encryption, and the browser is sent round in circles between HTTP and HTTPS.
3. **A certificate Cloudflare accepts on the server.** Coolify's proxy asks Let's Encrypt over HTTP by
   default, and Coolify's documentation says a proxy in front can break that check, at the first issue or
   at a renewal three months on. Its two ways round it:
   - A **Cloudflare Origin Certificate** (SSL/TLS > Origin Server > Create Certificate, for `zolace.cash` and
     `*.zolace.cash`). Put the certificate and its key on the server under `/data/coolify/proxy/certs/`, and
     in Coolify under Server > Proxy > Dynamic Configuration add a file that names them:

     ```yaml
     tls:
       certificates:
         - certFile: /traefik/certs/zolace.cert
           keyFile: /traefik/certs/zolace.key
     ```

     It lasts up to fifteen years and needs no renewal. Only Cloudflare trusts it, which is all that is
     needed while every visitor comes through Cloudflare.
   - Or a **DNS challenge** in Coolify's proxy, with a Cloudflare API token that can edit this one zone's
     DNS (Coolify's documentation, "DNS Challenge").
4. **SSL/TLS > Edge Certificates**: **Always Use HTTPS** on.
5. Leave off what rewrites pages on the way: Rocket Loader, and any rule that caches HTML ("Cache
   Everything"). An order's page must never be served from a cache.
6. Worth doing: let the server's firewall take port 443 from Cloudflare's published addresses only, so
   nobody reaches the site around Cloudflare.

What Cloudflare sees is said at the top of this file, under "What Cloudflare costs in privacy". It holds on
Coolify as well.

Tried here: requests carrying Cloudflare's headers went through this nginx. One visitor was slowed after a
burst of order requests while another was not, and pages came back with `no-store`. Cloudflare itself, and
the certificate steps above, were not run: they are written from Coolify's documentation.

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

## Real payments

The shop takes test orders until three settings are filled in (`.env`, or Environment Variables on Coolify):

| Setting | What it is |
| --- | --- |
| `PAYMENT_NETWORK` | `mainnet` for real ZEC, `testnet` for test coins |
| `ENGINE_ENCRYPTION_KEY` | Secret. 64 hex characters, made once: `openssl rand -hex 32`. It encrypts the viewing key where the payment engine stores it |
| `ZCASH_VIEWING_KEY` | Secret. The unified full viewing key of the shop's wallet (`uview1...`). It lets the engine see payments arrive; it cannot spend them. Never the wallet's seed phrase |

Then start again (`docker compose up -d --build`, or Redeploy). The `engine` service starts, `engine-setup`
gives it the viewing key and ends, and the site begins to ask it for one address per order. Check with
`sh deploy/preflight.sh` (or `node preflight.mjs` in the `app` container): the lines "payments" and "the
engine knows the site's key" have to be ok.

The first build of the engine compiles it from source: ten minutes or more, and a few gigabytes of memory.
A small server may not manage it.

Before `mainnet`: the site's pages still call every order a test order in fixed text, and a made-up item is
never sold for real money, so the shelf is empty until real items are on it (`/owner/products`). And pay
one small order yourself first.

More on the engine, and what was and was not run: `engine/cipherpay/README.md`.

## Items made when they are paid for (eSIM)

An item can be bought from a supplier the moment its order is paid, instead of being handed over from codes
you uploaded. The supplier is eSIM Access; nothing is held in stock, and the eSIM's code is sealed to the
buyer as soon as the supplier hands it over.

1. Make an account at `console.esimaccess.com`, put a small amount on it, and copy its AccessCode.
2. Set `ESIMACCESS_CODE` to that AccessCode (a secret) and start again.
3. In `/owner/products`, add an item and fill in "Supplier's package" with the package's code or slug from
   the supplier's list, for example `JP_5_30`. The item's card then shows what the package costs you now,
   what is left of each sale, and your balance there.
4. Put it on the shelf.

What the shop does with it:

- It is sold only where real payments are taken, while the supplier lists the package, while it costs you no
  more than its price here, and while your balance there covers it. Otherwise the order is not started.
- It is bought when the payment is three blocks deep, once, however often the order is looked at.
- If the supplier refuses, or has not delivered half an hour after the payment was seen, the payment is put
  on the refund queue. If something was bought by then, cancel it in the supplier's console: an eSIM that
  was never installed is refunded to your balance there.
- The supplier is told which package and a hash of the order. It is not told who the buyer is: the shop
  does not know either.

Money: the buyer pays ZEC into the shop's wallet, and the supplier takes its price out of your balance with
it. Nothing tops that balance up but you. `node preflight.mjs` shows what is left.

The key can spend the balance and nothing else, so keep the balance small. Run so far against a played
supplier only (`tests/supplier.test.ts`): no eSIM has been bought through the shop yet.

## Other sellers

`SELLING=open` lets anyone sign up as a seller at `/sell/start` with the viewing key of their own wallet,
list items and put codes behind them. An order of a seller's item gets an address made from that seller's
viewing key, so the payment arrives in the seller's wallet. The shop never holds it and cannot refund it:
what such an order is owed back is the seller's to send, and it is never on your refunds screen.

- It needs real payments (the three settings above). Without them, or with `SELLING` empty, nobody can
  sign up and no seller's item is shown or sold; items and sellers already there are kept.
- `/owner/sellers` lists every seller with their items, the reports buyers made that the seller has not
  answered, and the refunds they have not sent. There you take an item down or close a seller. You
  cannot read a seller's codes or change their items.
- `SELLER_MAX_PRICE` (dollars, 100 unless set) and `SELLER_MAX_ITEMS` (20 unless set) bound what a buyer
  can lose to a seller who does not deliver. `SELLERS_MAX` (500 unless set) is how many may sign up.
- A seller's viewing key is handed to the payment engine, which keeps the incoming half of it, encrypted
  with `ENGINE_ENCRYPTION_KEY`, on its own volume. The site's database keeps the engine's key for that
  seller and a hash of the secret in the seller's link. Lose the engine's volume and every seller has to
  sign up again with a new wallet.
- The engine takes about two sign-ups a minute. A third is told to wait.
- Run on testnet, 12 Oct 2026: one order of a seller's item, paid from a public faucet with far more than
  the price. Seen within a minute, handed over at three blocks, the item opened in the buyer's browser;
  the excess was owed by the seller, on the seller's desk, and never on the owner's refunds screen. Not
  run on mainnet.

## Items you buy after they are paid for (gift cards)

An item marked "I buy it myself after the order is paid" is sold with nothing in stock. Its order
shows on the owner's screen (`/owner`) once the payment is three blocks deep, and not before: buy
nothing for an order that is not listed there. You then buy the item wherever you buy it, paste it
into the order and hand it over. What you paste is sealed to the buyer's key at once.

- `HAND_HOURS` is how long you have (12 unless set). After that the order leaves your list and the
  payment is owed back, so take such an item off the shelf while you cannot look.
- `OWNER_NOTIFY_URL` makes the server tell your phone when an order waits. The simplest is ntfy:
  install its app, subscribe to a topic with a long random name, and set
  `OWNER_NOTIFY_URL=https://ntfy.sh/<that name>`. A Telegram bot address
  (`https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`) and a Discord webhook work too.
  The address is a secret: whoever knows it can read the notices. A notice names no order, no item
  and no amount. After a restart, whatever still waits is said once more.
- The owner's orders screen says whether notices are on and has a button that sends a test one.

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
payout screen stays switched off, until `VAULT_ADDRESS` is set as well (`CONTRACT.md`, "The hourly vault").
In order:

1. Make a signing key, on your own machine, in the project folder: `node deploy/vault-key.mjs`. It prints
   the key and the address it signs as. The key is a secret.
2. Deploy `contracts/src/ZolaceVault.sol` from the owner's wallet (`contracts/deploy/ZolaceVault.flat.sol`
   is the same contract in one file, for a browser compiler: 0.8.34, EVM version cancun, optimizer on, 200
   runs). Its five values: the owner's wallet, the reward token (NVDA), 333, the signer's address from
   step 1, and 0 for the rate.
3. Set `VAULT_ADDRESS`, `VAULT_SIGNER_KEY` and `TOKEN_DEPLOY_BLOCK` (the block the token was made in) in
   `.env`, and restart the app.
4. On `/owner/payout`: check that the server's key and the vault's signer are the same, set the rate from
   NVDA's price, and put NVDA in. All three are sent from the owner's wallet in that browser.

The server counts each hour by itself, a few minutes after it ends, and signs the list. It reads a few
dozen blocks and three stretches of transfers an hour, which the public endpoint serves; when that endpoint
answers "too many requests" the count waits and tries again, and a provider's endpoint in `TOKEN_RPC_URL`
avoids the waiting. The first count reads the token's transfers back to `TOKEN_DEPLOY_BLOCK`.

The server sends nothing to the chain. It holds one key for it, the signing key: that key holds no funds
and needs no ETH, and its address should never be sent anything. Whoever has the key could sign a list of
their own, so it is in `.env` and nowhere else, and the vault should hold no more than a week or two
needs. If the key may have leaked: make a new one, set it, and name its address as the signer on
`/owner/payout`. Every list the old key signed stops counting at once.

Addresses that hold the token and could never claim (a pool, a locker) go into `VAULT_SKIP`, apart by
commas. The curve of a token made on Pons is left out already.

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
