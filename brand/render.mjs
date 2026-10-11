// Renders the X profile assets in this folder to PNG, at twice their nominal size:
//   x-avatar.svg  (400 x 400)   ->  x-avatar.png  (800 x 800), and x-avatar-black the same way
//   x-banner.html (1500 x 500)  ->  x-banner.png  (3000 x 1000)
//   x-post.html   (1600 x 900)  ->  x-post-site.png and x-post-token.png (3200 x 1800), one per card
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
