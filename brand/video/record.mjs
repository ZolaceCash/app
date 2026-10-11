// Records one test order on the local copy of the site as JPEG frames with their times.
// Nothing here touches the live site, and no payment is made: the local copy runs the stand-in.
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer-core"

const out = process.argv[2]
const base = "http://localhost:5180"
const W = 1280
const H = 720
const SCALE = 1.25
fs.rmSync(path.join(out, "frames"), { recursive: true, force: true })
fs.mkdirSync(path.join(out, "frames"), { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--hide-scrollbars", `--window-size=${W},${H}`],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE })
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])

// A pointer drawn into the page (a headless browser shows none), and the dev badge hidden.
await page.evaluateOnNewDocument(() => {
  const KEY = "__pointer"
  const make = () => {
    if (!document.documentElement || document.getElementById("__pointer")) return
    const style = document.createElement("style")
    style.textContent = `nextjs-portal{display:none!important}
      #__pointer{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:28px;height:28px;transform:translate(-100px,-100px)}
      #__pointer svg{display:block;transform-origin:4px 2px;transition:transform .1s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.65))}
      #__pointer.down svg{transform:scale(.8)}`
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
      pointer.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`
      try {
        sessionStorage.setItem(KEY, `${e.clientX - 4},${e.clientY - 2}`)
      } catch {}
    },
    true,
  )
  addEventListener("mousedown", () => document.getElementById("__pointer")?.classList.add("down"), true)
  addEventListener("mouseup", () => document.getElementById("__pointer")?.classList.remove("down"), true)
  make()
  document.addEventListener("DOMContentLoaded", make)
  setInterval(make, 150)
})

let at = { x: 900, y: 420 }
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
const centre = async (xpath) => {
  const [el] = await page.$$("xpath/" + xpath)
  if (!el) throw new Error("not found: " + xpath)
  const b = await el.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b }
}
const pageTop = (xpath) =>
  page.evaluate((xp) => {
    const el = document.evaluate(xp, document, null, 9, null).singleNodeValue
    return el ? el.getBoundingClientRect().top + scrollY : null
  }, xpath)
const says = (source) => page.evaluate((src) => new RegExp(src, "i").test(document.body.innerText), source)

const marks = []
const frames = []
const mark = (name) => {
  marks.push({ name, t: Date.now() / 1000 })
  console.log("mark", name)
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

await page.goto(base + "/shop", { waitUntil: "networkidle2" })
await page.mouse.move(at.x, at.y)
await sleep(600)
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 93, everyNthFrame: 1 })
mark("shop")
await sleep(1600)
const cardsTop = await pageTop(".//a[@href='/shop/test-licence']")
await scrollTo(Math.max(0, cardsTop - 170), 1100)
await sleep(700)
let p = await centre(".//a[@href='/shop/test-licence']")
await glide(p.x, Math.min(p.y, p.box.y + 110), 800)
await sleep(500)
mark("pick")
await Promise.all([page.waitForFunction(() => location.pathname === "/shop/test-licence", { timeout: 20000 }), press()])
await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => {})
mark("item")
await sleep(2000)
p = await centre(`.//button[contains(${UP}, 'TRY A TEST ORDER')]`)
await glide(p.x, p.y, 800)
await sleep(550)
mark("checkout")
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }), press()])
mark("order")
await sleep(1800)
const sendTop = await pageTop(`.//*[not(*) and ${UP}='SEND EXACTLY']`)
console.log("send exactly at", sendTop)
await scrollTo(Math.max(0, (sendTop ?? 385) - 115), 1100)
await sleep(600)
p = await centre(".//*[not(*) and contains(text(), 'test-address-')]")
await glide(p.x - 40, p.y, 700)
await sleep(2400)
p = await centre(`.//button[contains(${UP}, 'SIMULATE THE PAYMENT')]`)
await glide(p.x, p.y, 700)
await sleep(600)
mark("pay")
await press()
await sleep(500)
await glide(330, 300, 900)
for (const [name, source] of [
  ["seen", "payment seen|confirming your payment|your item"],
  ["confirming", "confirming your payment|your item"],
  ["delivered", "copy the item"],
]) {
  for (let i = 0; i < 300 && !(await says(source)); i++) await sleep(100)
  mark(name)
}
await sleep(1200)
console.log("copy button at", await pageTop(`.//button[contains(${UP}, 'COPY THE ITEM')]`), "scrollY", await page.evaluate(() => scrollY))
p = await centre(`.//button[contains(${UP}, 'COPY THE ITEM')]`)
await glide(p.x - 30, p.y - 70, 800)
await sleep(2600)
mark("link")
const HAS = `contains(${UP}, 'KEEP THIS LINK')`
const linkTop = await pageTop(`.//*[${HAS} and not(.//*[${HAS}])]`)
console.log("keep this link at", linkTop)
await scrollTo(Math.max(0, (linkTop ?? 800) - 125), 1100)
p = await centre(`.//button[contains(${UP}, 'COPY THE LINK')]`)
await glide(p.x + 60, p.y - 60, 800)
await sleep(3000)
mark("end")
await cdp.send("Page.stopScreencast")
fs.writeFileSync(path.join(out, "take.json"), JSON.stringify({ width: W * SCALE, height: H * SCALE, marks, frames }, null, 1))
const t0 = marks[0].t
console.log("frames kept", frames.length, "| length", (marks.at(-1).t - t0).toFixed(1), "s")
console.log(marks.map((m) => `${m.name}@${(m.t - t0).toFixed(1)}`).join("  "))
console.log("frame clock vs marks:", (frames[0].t - t0).toFixed(2), "s after the first mark")
await browser.close()
