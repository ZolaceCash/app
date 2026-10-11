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
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Only for a hosted database. Left out, the database is local |

Fill it in, then:

```bash
sh deploy/init-cert.sh
docker compose up -d --build
```

`init-cert.sh` gets the first certificate and agrees to Let's Encrypt's subscriber agreement in your name.
It is run once. After that the `certbot` container looks twice a day and renews when a certificate has
under 30 days left, and nginx reloads twice a day to pick a new one up.

The site makes its own tables and puts the three test items on the shelf the first time it is opened.

## The database

By default it is local: one SQLite file, `zolace.db`, on the `zolace-data` volume. Nothing else has to run.

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

- The payment engine. It is not wired into the site (PLAN.md, "Stage 0: what was run"). When it is, it
  gets a container of its own that only the site can reach.
- A Tor mirror.
- Backups on a schedule.
