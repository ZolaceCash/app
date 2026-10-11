import { defineConfig } from "hardhat/config";

// The token contract and its tests (CONTRACT.md). This package is apart from the site: it has
// its own dependencies, and nothing here is imported by the app.
//
// No network is configured on purpose. Deploying is a later step and is done with the owner's
// key, which never goes into this repository or anywhere the server can read.
export default defineConfig({
  paths: {
    sources: "src",
  },
  solidity: {
    version: "0.8.34",
    settings: {
      // Robinhood Chain is an Arbitrum Nitro chain. Which EVM version it runs was not read from
      // its docs: confirm this on testnet before any deployment (CONTRACT.md, "Not checked").
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  test: {
    solidity: {
      fuzz: {
        runs: 512,
      },
      invariant: {
        runs: 128,
        depth: 64,
        failOnRevert: true,
      },
    },
  },
});
