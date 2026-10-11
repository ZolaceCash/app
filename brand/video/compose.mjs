// Serves the take and compose.html to a headless Chrome on this machine only, and either saves a
// still (node compose.mjs <demo> still <seconds> <png>) or lets the page encode the film frame by
// frame (encode.js, with mp4-muxer.mjs copied from the npm package of that name) and writes what
// it sends back (node compose.mjs <demo> film <mp4>).
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

import puppeteer from "puppeteer-core"

const here = path.dirname(fileURLToPath(import.meta.url))
const [given, mode, a, b] = process.argv.slice(2)
const demo = path.resolve(given)
// Which page puts the film together: compose.html, or another one named in PAGE.
const PAGE = process.env.PAGE ?? "compose.html"
const TYPES = { ".html": "text/html", ".json": "application/json", ".jpg": "image/jpeg", ".js": "text/javascript", ".mjs": "text/javascript" }
// What is served from beside this script; everything else comes from the take's folder.
const OURS = ["encode.js", "mp4-muxer.mjs"]
let saved = null
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://x")
  if (request.method === "POST" && url.pathname === "/out") {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => {
      saved = Buffer.concat(chunks)
      response.end("ok")
    })
    return
  }
  const name = decodeURIComponent(url.pathname).replace(/^\/+/, "")
  const ours = name === PAGE || OURS.includes(name)
  const file = ours ? path.join(here, name) : path.join(demo, name)
  if (!file.startsWith(ours ? here : demo) || !fs.existsSync(file)) {
    response.statusCode = 404
    return response.end("no")
  }
  response.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream")
  fs.createReadStream(file).pipe(response)
})
await new Promise((ready) => server.listen(0, "127.0.0.1", ready))
const base = `http://127.0.0.1:${server.address().port}/${PAGE}`

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--hide-scrollbars", "--window-size=1920,1080", "--autoplay-policy=no-user-gesture-required"],
})
const page = await browser.newPage()
page.on("console", (message) => console.log("page:", message.text().slice(0, 300)))
page.on("pageerror", (error) => console.log("page error:", String(error).slice(0, 300)))
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })

if (mode === "still") {
  for (const [index, seconds] of a.split(",").entries()) {
    await page.goto(`${base}?still=${seconds}`, { waitUntil: "networkidle0" })
    await page.waitForFunction("window.done === true", { timeout: 30000 })
    if (index === 0) console.log(JSON.stringify(await page.evaluate("window.film")))
    await page.screenshot({ path: b.replace("%", seconds) })
  }
} else {
  await page.goto(base, { waitUntil: "domcontentloaded" })
  await page.waitForFunction("window.done === true", { timeout: 900000, polling: 500 })
  console.log(JSON.stringify(await page.evaluate("window.film")))
  fs.writeFileSync(a, saved)
  console.log("saved", a, (saved.length / 1e6).toFixed(1), "MB")
}
await browser.close()
server.close()
