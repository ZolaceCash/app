// Records one test order of the eSIM on the local copy of the site, as JPEG frames with their
// times, the moments that matter and where things were on the screen at those moments (for the
// camera in compose2.html). Twice the screen's pixels, so the film can move in close and stay sharp.
// Nothing here touches the live site, and no payment is made: the local copy runs the stand-in.
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer-core"

const out = path.resolve(process.argv[2])
const SLUG = process.argv[3] ?? "us-esim-1gb-7d"
const base = "http://localhost:5180"
const W = 1280
const H = 720
// The screen capture gives one picture pixel for one page pixel, whatever the device scale. So
// the window is made twice as large and the page itself is scaled up twice (CSS zoom): the
// layout is the 1280-wide one, drawn on 2560 pixels. Everything measured on the page below is in
// those doubled pixels; what is written to take.json is brought back to the 1280-wide page.
const Z = 2
fs.rmSync(path.join(out, "frames"), { recursive: true, force: true })
fs.mkdirSync(path.join(out, "frames"), { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--hide-scrollbars", `--window-size=${W * Z},${H * Z}`],
})
const page = await browser.newPage()
await page.setViewport({ width: W * Z, height: H * Z, deviceScaleFactor: 1 })
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])

// A pointer drawn into the page (a headless browser shows none), a square pulse where it presses,
// and the dev badge hidden.
await page.evaluateOnNewDocument((Z) => {
  const KEY = "__pointer"
  const make = () => {
    if (!document.documentElement) return
    document.documentElement.style.zoom = String(Z)
    if (document.getElementById("__pointer")) return
    const style = document.createElement("style")
    style.textContent = `nextjs-portal{display:none!important}
      #__pointer{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:28px;height:28px;transform:translate(-100px,-100px)}
      #__pointer svg{display:block;transform-origin:4px 2px;transition:transform .1s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.65))}
      #__pointer.down svg{transform:scale(.8)}
      .__pulse{position:fixed;z-index:2147483646;pointer-events:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:5px;border:2px solid #9aa7ff;animation:__pulse .55s cubic-bezier(.2,.7,.2,1) forwards}
      @keyframes __pulse{from{transform:scale(.6) rotate(0deg);opacity:1}to{transform:scale(3.6) rotate(45deg);opacity:0}}`
    document.documentElement.append(style)
    const pointer = document.createElement("div")
    pointer.id = "__pointer"
    pointer.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 15 L11.6 22 L14.6 20.7 L11.7 14 L18 14 Z" fill="#fff" stroke="#0b0b10" stroke-width="1.4" stroke-linejoin="round"/></svg>`
    document.documentElement.append(pointer)
    try {
      const saved = sessionStorage.getItem(KEY)
      if (saved) pointer.style.transform = `translate(${saved.split(",")[0]}px,${saved.split(",")[1]}px)`
    } catch {}
  }
  addEventListener(
    "mousemove",
    (e) => {
      const pointer = document.getElementById("__pointer")
      if (!pointer) return
      pointer.style.transform = `translate(${e.clientX / Z - 4}px,${e.clientY / Z - 2}px)`
      try {
        sessionStorage.setItem(KEY, `${e.clientX / Z - 4},${e.clientY / Z - 2}`)
      } catch {}
    },
    true,
  )
  addEventListener(
    "mousedown",
    (e) => {
      document.getElementById("__pointer")?.classList.add("down")
      const pulse = document.createElement("div")
      pulse.className = "__pulse"
      pulse.style.left = e.clientX / Z + "px"
      pulse.style.top = e.clientY / Z + "px"
      document.documentElement.append(pulse)
      setTimeout(() => pulse.remove(), 700)
    },
    true,
  )
  addEventListener("mouseup", () => document.getElementById("__pointer")?.classList.remove("down"), true)
  make()
  document.addEventListener("DOMContentLoaded", make)
  setInterval(make, 150)
}, Z)

let at = { x: 900 * Z, y: 420 * Z }
async function glide(x, y, ms = 750) {
  const steps = Math.max(10, Math.round(ms / 16))
  const from = { ...at }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e)
    await sleep(16)
  }
  at = { x, y }
}
const press = async () => {
  await page.mouse.down()
  await sleep(110)
  await page.mouse.up()
}
const scrollTo = (top, ms = 900) =>
  page.evaluate(
    (top, ms) =>
      new Promise((done) => {
        const from = scrollY
        const start = performance.now()
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms)
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
          window.scrollTo(0, from + (top - from) * e)
          if (t < 1) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      }),
    top,
    ms,
  )
const UP = "translate(normalize-space(.), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')"
const has = (words) => `contains(${UP}, '${words}')`
const deepest = (words) => `.//*[${has(words)} and not(.//*[${has(words)}])]`
// Where an element is on the screen right now. `grow` climbs to the first ancestor at least that wide.
const box = (xpath, grow = 0) =>
  page.evaluate(
    (xp, grow) => {
      let el = document.evaluate(xp, document, null, 9, null).singleNodeValue
      if (!el) return null
      while (grow && el.parentElement && el.getBoundingClientRect().width < grow) el = el.parentElement // grow is in doubled pixels
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height, top: r.top + scrollY }
    },
    xpath,
    grow * Z,
  )
const need = async (xpath, grow = 0) => {
  const found = await box(xpath, grow)
  if (!found) throw new Error("not found: " + xpath)
  return found
}
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const says = (source) => page.evaluate((src) => new RegExp(src, "i").test(document.body.innerText), source)

const marks = []
const frames = []
const spots = {}
const mark = (name) => {
  marks.push({ name, t: Date.now() / 1000 })
  console.log("mark", name)
}
const spot = (name, b) => {
  spots[name] = { x: Math.round(b.x / Z), y: Math.round(b.y / Z), w: Math.round(b.w / Z), h: Math.round(b.h / Z) }
}
let kept = 0
let lastKept = 0
const cdp = await page.createCDPSession()
cdp.on("Page.screencastFrame", (f) => {
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  const t = f.metadata.timestamp
  if (t - lastKept < 0.03) return
  lastKept = t
  const name = `f-${String(++kept).padStart(5, "0")}.jpg`
  fs.writeFileSync(path.join(out, "frames", name), Buffer.from(f.data, "base64"))
  frames.push({ name, t })
})

const LINK = `.//a[@href='/shop/${SLUG}']`
await page.goto(base + "/shop", { waitUntil: "networkidle2" })
await page.mouse.move(at.x, at.y)
await sleep(600)
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 })
mark("shop")
await sleep(1300)
await scrollTo(Math.max(0, (await need(LINK)).top - 250 * Z), 1300)
await sleep(500)
spot("card", await need(LINK, 300))
let b = await need(LINK)
await glide(b.x + Math.min(b.w / 2, 120 * Z), b.y + b.h / 2, 800)
await sleep(700)
mark("pick")
await Promise.all([page.waitForFunction((slug) => location.pathname === "/shop/" + slug, { timeout: 20000 }, SLUG), press()])
await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {})
mark("item")
await sleep(1500)
const BUY = `.//main//button[${has("ORDER")}]`
spot("buy", await need(BUY))
spot("price", await need(`.//main//h1`, 500))
b = mid(await need(BUY))
await glide(b.x, b.y, 850)
await sleep(700)
mark("checkout")
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }), press()])
mark("order")
await sleep(1500)
await scrollTo(Math.max(0, (await need(deepest("SEND EXACTLY"))).top - 115 * Z), 1100)
await sleep(300)
mark("order-still")
spot("amount", await need(deepest("SEND EXACTLY"), 500))
spot("send", await need(deepest("SEND EXACTLY")))
b = mid(await need(".//*[not(*) and contains(text(), 'test-address-')]"))
await glide(b.x - 40 * Z, b.y, 800)
await sleep(2300)
const SIM = `.//button[${has("SIMULATE THE PAYMENT")}]`
spot("simulate", await need(SIM))
b = mid(await need(SIM))
await glide(b.x, b.y, 750)
await sleep(700)
mark("pay")
await press()
await sleep(500)
await glide(330 * Z, 300 * Z, 900)
for (const [name, source] of [
  ["seen", "payment seen|confirming your payment|your item"],
  ["confirming", "confirming your payment|your item"],
]) {
  for (let i = 0; i < 300 && !(await says(source)); i++) await sleep(100)
  mark(name)
}
await sleep(300)
const blocks = await box(deepest("OF 3 BLOCKS"), 400)
if (blocks) spot("blocks", blocks)
for (let i = 0; i < 400 && !(await says("copy the item")); i++) await sleep(100)
mark("delivered")
await sleep(900)
// The QR: the first square picture in the panel that holds the item.
const qr = await page.evaluate((least) => {
  const found = [...document.querySelectorAll("main svg, main canvas, main img")].map((el) => el.getBoundingClientRect()).find((r) => r.width >= least && Math.abs(r.width - r.height) < 4)
  return found ? { x: found.left, y: found.top, w: found.width, h: found.height } : null
}, 120 * Z)
console.log("qr", JSON.stringify(qr), "scrollY", await page.evaluate(() => scrollY))
if (qr) spot("qr", qr)
spot("item", await need(`.//button[${has("COPY THE ITEM")}]`, 500))
if (qr) await glide(qr.x + qr.w + 60 * Z, qr.y + qr.h / 2 + 20 * Z, 850)
await sleep(3400)
mark("link")
await scrollTo(Math.max(0, (await need(deepest("KEEP THIS LINK"))).top - 125 * Z), 1100)
await sleep(250)
mark("link-still")
spot("link", await need(deepest("KEEP THIS LINK"), 400))
b = mid(await need(`.//button[${has("COPY THE LINK")}]`))
await glide(b.x + 60 * Z, b.y - 60 * Z, 800)
await sleep(2800)
mark("end")
await cdp.send("Page.stopScreencast")
fs.writeFileSync(path.join(out, "take.json"), JSON.stringify({ width: W, height: H, scale: Z, marks, spots, frames }, null, 1))
const t0 = marks[0].t
console.log("frames kept", frames.length, "| length", (marks.at(-1).t - t0).toFixed(1), "s")
console.log(marks.map((m) => `${m.name}@${(m.t - t0).toFixed(1)}`).join("  "))
console.log("spots", JSON.stringify(spots))
await browser.close()
