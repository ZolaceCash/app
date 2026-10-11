"use server"

import { refresh } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { FormState } from "@/components/owner/action-form"
import { addStock, createProduct, markRefunded, parsePrice, updateProduct } from "@/lib/admin"
import { isOwnerSecret, newSession, ownerEnabled } from "@/lib/owner"
import { isOwner, OWNER_COOKIE, OWNER_PATH } from "@/lib/owner-session"
import { tokenConfig, vaultLive } from "@/lib/token"
import { hourLabel } from "@/lib/vault"
import { advance } from "@/lib/vault-store"

// What the owner's screens can do. Each of these can be called by anyone who sends the right
// request, with or without the screen, so each one checks the session itself before it acts.

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

const SIGNED_OUT: FormState = { error: "You are signed out. Sign in again." }

// An error from the chain can run to many lines: the first one says what went wrong.
const firstLine = (message: string) => message.split("\n")[0]

export async function signIn(_previous: FormState, form: FormData): Promise<FormState> {
  // Every attempt waits, right or wrong, so guessing is slow. No address is kept to do this.
  await new Promise((resolve) => setTimeout(resolve, 700))

  if (!ownerEnabled()) return { error: "The owner's screens are switched off on this server." }
  if (!isOwnerSecret(String(form.get("secret") ?? ""))) return { error: "That is not the owner's secret." }

  const session = newSession()
  if (!session) return { error: "The owner's screens are switched off on this server." }
  const jar = await cookies()
  jar.set(OWNER_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: OWNER_PATH,
    expires: new Date(session.expiresAt),
  })
  redirect("/owner")
}

export async function signOut() {
  const jar = await cookies()
  jar.set(OWNER_COOKIE, "", { httpOnly: true, sameSite: "strict", path: OWNER_PATH, maxAge: 0 })
  redirect("/owner/login")
}

export async function refundSent(_previous: FormState, form: FormData): Promise<FormState> {
  if (!(await isOwner())) return SIGNED_OUT
  if (form.get("sent") !== "yes") return { error: "Tick the box once the refund has left your wallet." }

  const done = await markRefunded(text(form, "id"))
  if (!done) return { error: "That order is not waiting for a refund any more." }
  refresh()
  return { ok: "Taken off the queue." }
}

export async function addItem(_previous: FormState, form: FormData): Promise<FormState> {
  if (!(await isOwner())) return SIGNED_OUT
  const priceCents = parsePrice(text(form, "price"))
  if (priceCents === null) return { error: "The price has to be an amount in dollars, like 12 or 12.50." }

  const result = await createProduct({
    slug: text(form, "slug"),
    name: text(form, "name"),
    blurb: text(form, "blurb"),
    priceCents,
  })
  if (!result.ok) return { error: result.error }
  refresh()
  return { ok: "Added, off the shelf. Upload codes, then put it on the shelf." }
}

export async function saveItem(_previous: FormState, form: FormData): Promise<FormState> {
  if (!(await isOwner())) return SIGNED_OUT
  const priceCents = parsePrice(text(form, "price"))
  if (priceCents === null) return { error: "The price has to be an amount in dollars, like 12 or 12.50." }

  const result = await updateProduct(Number(text(form, "id")), {
    name: text(form, "name"),
    blurb: text(form, "blurb"),
    priceCents,
    active: form.get("active") === "yes",
  })
  if (!result.ok) return { error: result.error }
  refresh()
  return { ok: "Saved." }
}

export async function uploadCodes(_previous: FormState, form: FormData): Promise<FormState> {
  if (!(await isOwner())) return SIGNED_OUT
  const result = await addStock(Number(text(form, "id")), String(form.get("codes") ?? ""))
  if (!result.ok) return { error: result.error }
  refresh()
  return { ok: `${result.added} code${result.added === 1 ? "" : "s"} added.` }
}

// Brings the vault's count up to the last full hour, now, instead of waiting for the server's own
// round. It reads the chain and writes the count; it signs nothing and sends nothing.
export async function countHours(): Promise<FormState> {
  if (!(await isOwner())) return SIGNED_OUT
  if (!vaultLive(tokenConfig())) return { error: "The vault is switched off on this server." }

  try {
    const result = await advance()
    refresh()
    if (result.hour === null) return { error: result.note ?? "The count could not start." }
    const upTo = `Counted up to ${hourLabel(result.hour + 1)}.`
    return { ok: result.behind > 0 ? `${upTo} ${result.behind} more hour${result.behind === 1 ? "" : "s"} to go: run it again.` : upTo }
  } catch (error) {
    return { error: error instanceof Error ? firstLine(error.message) : "The hours could not be counted." }
  }
}
