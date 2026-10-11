#!/bin/sh
# What the site needs from the server it runs on: both ZEC price sources, the token's network, the
# settings. Run it after the first start, and again after changing .env:
#
#   sh deploy/preflight.sh
#
# The check itself is deploy/preflight.mjs, which is inside the site's image. It changes nothing
# and prints no secret.
set -eu

${COMPOSE:-docker compose} exec -T app node preflight.mjs
