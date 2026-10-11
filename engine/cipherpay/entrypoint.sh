#!/bin/sh
# Starts the payment engine, or waits quietly when it has not been switched on.
#
# The engine is switched on by giving it ENCRYPTION_KEY (it encrypts the viewing key where the
# engine stores it). Without one the container stays up and does nothing, so a server that only
# takes test orders deploys the same way as one that takes payments.
set -eu

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "The payment engine is switched off: ENGINE_ENCRYPTION_KEY is not set. The shop takes test orders only."
  exec sleep infinity
fi

# Which chain explorer to read, unless told: the one for the network the engine is on.
if [ -z "${CIPHERSCAN_API_URL:-}" ]; then
  if [ "${NETWORK:-mainnet}" = "testnet" ]; then
    export CIPHERSCAN_API_URL="https://api.testnet.cipherscan.app"
  else
    export CIPHERSCAN_API_URL="https://api.mainnet.cipherscan.app"
  fi
fi

echo "The payment engine is starting on ${NETWORK:-mainnet}, reading ${CIPHERSCAN_API_URL}."
exec cipherpay
