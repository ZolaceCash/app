#!/bin/sh
# Gets the first certificate, once, before the site is started. After that the certbot service in
# docker-compose.yml keeps it renewed. Run from the folder that holds docker-compose.yml:
#   sh deploy/init-cert.sh
#
# Running this agrees to Let's Encrypt's subscriber agreement (--agree-tos) in the owner's name.
set -eu

if [ ! -f .env ]; then
  echo "There is no .env here. Copy deploy/env.example to .env and fill it in." >&2
  exit 1
fi
if [ ! -f deploy/secrets/cloudflare.ini ]; then
  echo "There is no deploy/secrets/cloudflare.ini. Copy the .example beside it and put the token in." >&2
  exit 1
fi

# Only the two values this script needs are read from .env.
DOMAIN=$(sed -n 's/^DOMAIN=//p' .env | tr -d '\r')
CERTBOT_EMAIL=$(sed -n 's/^CERTBOT_EMAIL=//p' .env | tr -d '\r')
if [ -z "$DOMAIN" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "DOMAIN and CERTBOT_EMAIL have to be set in .env." >&2
  exit 1
fi

docker compose run --rm --entrypoint certbot certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /run/secrets/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$CERTBOT_EMAIL" \
  --agree-tos --no-eff-email --non-interactive

echo "The certificate for $DOMAIN is in place. Start the site with: docker compose up -d --build"
