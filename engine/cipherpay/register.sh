#!/bin/sh
# Gives the engine the shop's viewing key, once, and leaves the key to the engine where the site
# reads it. Run by the `engine-setup` service of the compose files each time the stack starts; it
# does nothing when there is nothing to do.
#
# The viewing key lets the engine see payments. It cannot spend them. It is never printed here,
# and neither is the key to the engine.
set -eu

KEY_FILE="${KEY_FILE:-/keys/api_key}"
ENGINE="${ENGINE_URL:-http://engine:3080}"

if [ -s "$KEY_FILE" ]; then
  echo "The engine's key is on file already. Nothing to do."
  exit 0
fi
if [ -z "${ZCASH_VIEWING_KEY:-}" ]; then
  echo "ZCASH_VIEWING_KEY is not set, so no key is given to the engine. The shop takes test orders only."
  exit 0
fi
if [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "ZCASH_VIEWING_KEY is set but ENGINE_ENCRYPTION_KEY is not: the engine is switched off. Set both."
  exit 1
fi

tries=0
until curl -s -o /dev/null "$ENGINE/api/health"; do
  tries=$((tries + 1))
  if [ "$tries" -gt 90 ]; then
    echo "The engine did not answer at $ENGINE."
    exit 1
  fi
  sleep 2
done

# The key travels in a file made for the moment, not on a command line another process could read.
body="$(mktemp)"
printf '{"ufvk":"%s"}' "$ZCASH_VIEWING_KEY" > "$body"
answer="$(curl -s -X POST "$ENGINE/api/merchants" -H 'Content-Type: application/json' --data-binary "@$body")"
rm -f "$body"

key="$(printf '%s' "$answer" | sed -n 's/.*"api_key":"\([^"]*\)".*/\1/p')"
if [ -z "$key" ]; then
  echo "The engine did not take the viewing key. It answered:"
  printf '%s\n' "$answer" | cut -c1-300
  echo "If it says the key is already registered, the engine remembers it from an earlier start and the"
  echo "key to the engine was lost with the volume it was on: remove the engine's own volume and start again."
  exit 1
fi

umask 022
printf '%s' "$key" > "$KEY_FILE"
echo "The viewing key is registered. The site can now ask the engine for an address per order."
