#!/bin/sh
# What the certbot container runs (docker-compose.yml). The Cloudflare token comes in through the
# environment, from .env; certbot wants it in a file, so the file is written here, inside the
# container, readable by nobody else, and never on the server's disk.
#
#   zolace-certbot first <domain> <email>   get the first certificate (deploy/init-cert.sh)
#   zolace-certbot renew-forever            look twice a day, renew when under 30 days are left
set -eu

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "CLOUDFLARE_API_TOKEN is not set in .env: certbot cannot prove the domain." >&2
  # Wait instead of leaving, so the container does not restart in a loop.
  if [ "${1:-}" = "renew-forever" ]; then exec sleep infinity; fi
  exit 1
fi

INI=/tmp/cloudflare.ini
umask 077
printf 'dns_cloudflare_api_token = %s\n' "$CLOUDFLARE_API_TOKEN" > "$INI"

case "${1:-}" in
  first)
    exec certbot certonly \
      --dns-cloudflare --dns-cloudflare-credentials "$INI" \
      --dns-cloudflare-propagation-seconds 30 \
      -d "$2" -d "www.$2" \
      --email "$3" \
      --agree-tos --no-eff-email --non-interactive
    ;;
  renew-forever)
    trap exit TERM
    while :; do
      certbot renew --dns-cloudflare --dns-cloudflare-credentials "$INI" --quiet || true
      sleep 12h &
      wait $!
    done
    ;;
  *)
    echo "usage: zolace-certbot first <domain> <email> | renew-forever" >&2
    exit 2
    ;;
esac
