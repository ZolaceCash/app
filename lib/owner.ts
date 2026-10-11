import { createHash, createHmac, timingSafeEqual } from "node:crypto"

// How the owner signs in (PLAN.md, "The owner's screens"). There is one owner and no account
// table: the owner knows one secret, set as OWNER_SECRET where the server runs. Signing in with it
// gives the browser a signed cookie that says until when it is good. Nothing about a session is
// stored, so changing the secret is how every session is ended at once.
//
// This secret opens the owner's screens and nothing else. It is not a key to any wallet: the
// server still holds none that can move funds.

export const SESSION_MS = 12 * 60 * 60 * 1000

// A secret shorter than this is treated as not set, so a weak one cannot be put in by mistake.
export const SECRET_MIN_LENGTH = 32

function secret() {
  const value = process.env.OWNER_SECRET ?? ""
  return value.length >= SECRET_MIN_LENGTH ? value : null
}

// False when no usable secret is set. The owner's screens are then switched off, not left open.
export function ownerEnabled() {
  return secret() !== null
}

const digest = (text: string) => createHash("sha256").update(text).digest()

export function isOwnerSecret(given: string) {
  const real = secret()
  if (!real) return false
  // Compared as digests: equal length, so the comparison takes the same time whatever was typed.
  return timingSafeEqual(digest(given), digest(real))
}

function sign(expiresAt: number, key: string) {
  return createHmac("sha256", key).update(`zolace/owner-session/v1:${expiresAt}`).digest("base64url")
}

export function newSession(now = Date.now()) {
  const key = secret()
  if (!key) return null
  const expiresAt = now + SESSION_MS
  return { token: `${expiresAt}.${sign(expiresAt, key)}`, expiresAt }
}

export function isSession(token: string | undefined, now = Date.now()) {
  const key = secret()
  if (!key || !token) return false
  const parts = token.split(".")
  if (parts.length !== 2) return false
  const expiresAt = Number(parts[0])
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false
  const given = Buffer.from(parts[1])
  const expected = Buffer.from(sign(expiresAt, key))
  return given.length === expected.length && timingSafeEqual(given, expected)
}
