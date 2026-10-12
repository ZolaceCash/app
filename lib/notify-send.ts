// Sending one line to a notification service: the owner's (lib/owner-notify.ts) and a seller's
// (lib/seller-notify.ts). The address decides the shape: Telegram's and Discord's want the line
// wrapped, and anything else (ntfy and the like) takes it as it is. False when it did not go out.
// The address is a secret and is never put in a log; a redirect is not followed, so the line goes
// to the address that was given and to no other.
export async function sendLine(url: URL, text: string, who = "notice"): Promise<boolean> {
  const wrapped = url.hostname === "api.telegram.org" ? { text } : /(^|\.)discord(app)?\.com$/.test(url.hostname) ? { content: text } : null
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": wrapped ? "application/json" : "text/plain; charset=utf-8" },
      body: wrapped ? JSON.stringify(wrapped) : text,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) console.error(`${who}: the service answered ${response.status}`)
    return response.ok
  } catch (error) {
    console.error(`${who}: not sent:`, error instanceof Error ? error.name : "error")
    return false
  }
}
