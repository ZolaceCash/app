// Renders the X profile assets in this folder to PNG, at twice their nominal size:
//   x-avatar.svg  (400 x 400)   ->  x-avatar.png  (800 x 800), and x-avatar-black the same way
//   x-banner.html (1500 x 500)  ->  x-banner.png  (3000 x 1000)
//   x-post.html   (1600 x 900)  ->  x-post-site.png and x-post-token.png (3200 x 1800), one per card
//   x-post-burn.html (1600 x 900) -> x-post-burn.png (3200 x 1800)
//   x-post-fee.html (1600 x 900)  -> x-post-fee.png (3200 x 1800)
//   x-post-funded.html (1600 x 900) -> x-post-funded.png (3200 x 1800)
//   x-post-vault.html (1600 x 900) -> x-post-vault.png (3200 x 1800); its proof line comes from the query
//   x-post-claims.html (1600 x 900) -> x-post-claims.png (3200 x 1800)
//   x-post-open.html (1600 x 900) -> x-post-open.png (3200 x 1800)
//   x-post-docs.html (1600 x 900) -> x-post-docs.png (3200 x 1800)
//   x-post-item.html (1600 x 900) -> x-post-item.png (3200 x 1800); its price comes from the query
// It drives an installed Chrome through puppeteer-core, which is not a dependency of the site:
//   npm install --no-save puppeteer-core && node brand/render.mjs
// CHROME_PATH overrides where Chrome is looked for. The banner loads its fonts from Google Fonts.
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import puppeteer from "puppeteer-core"

const here = path.dirname(fileURLToPath(import.meta.url))
const executablePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe"

const ASSETS = [
  { source: "x-avatar.svg", output: "x-avatar.png", width: 400, height: 400 },
  { source: "x-avatar-black.svg", output: "x-avatar-black.png", width: 400, height: 400 },
  { source: "x-banner.html", output: "x-banner.png", width: 1500, height: 500 },
  { source: "x-post.html", query: "?card=site", output: "x-post-site.png", width: 1600, height: 900 },
  { source: "x-post.html", query: "?card=token", output: "x-post-token.png", width: 1600, height: 900 },
  { source: "x-post-burn.html", output: "x-post-burn.png", width: 1600, height: 900 },
  { source: "x-post-fee.html", output: "x-post-fee.png", width: 1600, height: 900 },
  { source: "x-post-funded.html", output: "x-post-funded.png", width: 1600, height: 900 },
  {
    source: "x-post-vault.html",
    // The top-up of 11 Oct 2026, read from the chain: 0.434866777389049604 NVDA into the vault.
    query: "?amount=0.4349&tx=0xc285cc8c022983e32503eba1fb0d93cf3afb6a488c9ae95db053322652f95de5",
    output: "x-post-vault.png",
    width: 1600,
    height: 900,
  },
  {
    source: "x-post-vault.html",
    // The same picture for the hours before the site takes claims: "funded", "claims open soon".
    query: "?amount=0.4349&tx=0xc285cc8c022983e32503eba1fb0d93cf3afb6a488c9ae95db053322652f95de5&soon=1",
    output: "x-post-vault-soon.png",
    width: 1600,
    height: 900,
  },
  { source: "x-post-claims.html", output: "x-post-claims.png", width: 1600, height: 900 },
  { source: "x-post-open.html", output: "x-post-open.png", width: 1600, height: 900 },
  { source: "x-post-docs.html", output: "x-post-docs.png", width: 1600, height: 900 },
  // The first item's price as the owner entered it (12 Oct 2026). Change it when the shelf changes.
  { source: "x-post-item.html", query: "?price=5.99", output: "x-post-item.png", width: 1600, height: 900 },
  { source: "x-post-lots.html", output: "x-post-lots.png", width: 1600, height: 900 },
  // What the live shelf showed on 12 Oct 2026. Change it to what the shop shows.
  { source: "x-post-shelves.html", query: "?on=esim&items=1&from=5.99", output: "x-post-shelves.png", width: 1600, height: 900 },
  { source: "x-post-phone.html", query: "?price=5.99", output: "x-post-phone.png", width: 1600, height: 900 },
]

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--hide-scrollbars"] })
for (const asset of ASSETS) {
  const page = await browser.newPage()
  await page.setViewport({ width: asset.width, height: asset.height, deviceScaleFactor: 2 })
  await page.goto(pathToFileURL(path.join(here, asset.source)).href + (asset.query ?? ""), { waitUntil: "networkidle0" })
  await page.evaluate(() => document.fonts?.ready)
  await page.screenshot({ path: path.join(here, asset.output) })
  await page.close()
  console.log(asset.output)
}
await browser.close()
