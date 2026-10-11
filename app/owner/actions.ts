"use server"

import { refresh } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { FormState } from "@/components/owner/action-form"
import { addStock, createProduct, markRefunded, parsePrice, updateProduct } from "@/lib/admin"
import { isOwnerSecret, newSession, ownerEnabled } from "@/lib/owner"
import { isOwner, OWNER_COOKIE, OWNER_PATH } from "@/lib/owner-session"
import { parseUnitsExact, tokenConfig, vaultLive } from "@/lib/token"
import { parseWallets } from "@/lib/vault"
import { monthSheet, recordMonth } from "@/lib/vault-store"

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

// The owner funded a month from their own wallet and records it. The list is worked out again
// here, from the chain, and it is only kept if the vault's contract holds that very root and that
// very amount: what the vault page lists is then what the contract pays.
export async function monthFunded(_previous: FormState, form: FormData): Promise<FormState> {
  if (!(await isOwner())) return SIGNED_OUT

  const config = tokenConfig()
  if (!vaultLive(config)) return { error: "The vault is switched off on this server." }
  const pool = parseUnitsExact(text(form, "pool"), config.reward.decimals)
  if (pool === null || pool === 0n) return { error: `The amount has to be in ${config.reward.symbol}, like 1.5.` }
  const skip = parseWallets(text(form, "skip"))
  if (skip === null) return { error: "One of the wallets left out is not an address." }

  try {
    const result = await recordMonth(await monthSheet(text(form, "month"), pool, skip))
    if (!result.ok) return { error: result.error }
  } catch (error) {
    return { error: error instanceof Error ? firstLine(error.message) : "The month could not be worked out." }
  }
  refresh()
  return { ok: "Recorded. The vault page now lists the month." }
}
