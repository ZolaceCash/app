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

# Only the two values this script needs are read from .env. The token goes to the container
# through docker compose, which reads .env itself.
value() {
  sed -n "s/^$1=//p" .env | tr -d '\r' | head -n 1
}
DOMAIN=$(value DOMAIN)
CERTBOT_EMAIL=$(value CERTBOT_EMAIL)
if [ -z "$DOMAIN" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "DOMAIN and CERTBOT_EMAIL have to be set in .env." >&2
  exit 1
fi

docker compose run --rm --entrypoint /bin/sh certbot \
  /usr/local/bin/zolace-certbot first "$DOMAIN" "$CERTBOT_EMAIL"

echo "The certificate for $DOMAIN is in place. Start the site with: docker compose up -d --build"
