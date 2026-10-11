// How an item is sealed so that only the buyer's browser can open it. The same code runs in the
// browser and on the server (both have WebCrypto); it imports nothing, so tests can load it bare.
//
// The order link is /o/<id>#<secret>. The secret never leaves the browser. From it:
//   - the browser makes an ECDH key pair and sends the public half to the server,
//   - it locks the private half with a key derived from the secret, and the server stores that
//     locked blob (useless without the secret) so the link works on any device.
// To deliver, the server makes a throwaway key pair, derives a shared key with the buyer's public
// key, encrypts the item and keeps only the ciphertext. To open, the browser unlocks its private
// key with the secret and derives the same shared key.

export type Wrapped = { iv: string; data: string }
export type Sealed = { epk: JsonWebKey; iv: string; data: string }
export type PublicKey = { kty: "EC"; crv: "P-256"; x: string; y: string }

const CURVE = { name: "ECDH", namedCurve: "P-256" } as const
const subtle = () => globalThis.crypto.subtle

export function toBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function random(length: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length))
}

// An AES-GCM key from key material, with `info` naming what the key is for.
async function deriveKey(material: BufferSource, info: string) {
  const base = await subtle().importKey("raw", material, "HKDF", false, ["deriveKey"])
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

function publicPart(jwk: JsonWebKey): PublicKey {
  return { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! }
}

// Browser, at checkout: the secret for the link, and what the server is given.
export async function newOrderKeys() {
  const secret = random(32)
  const pair = await subtle().generateKey(CURVE, true, ["deriveBits"])
  const publicKey = publicPart(await subtle().exportKey("jwk", pair.publicKey))
  const privateKey = await subtle().exportKey("pkcs8", pair.privateKey)

  const iv = random(12)
  const lock = await deriveKey(secret, "zolace/wrap/v1")
  const data = await subtle().encrypt({ name: "AES-GCM", iv }, lock, privateKey)

  const wrappedKey: Wrapped = { iv: toBase64Url(iv), data: toBase64Url(new Uint8Array(data)) }
  return { secret: toBase64Url(secret), publicKey, wrappedKey }
}

// Server, at delivery: the item as ciphertext only the holder of the private key can read.
export async function sealTo(publicKey: PublicKey, text: string): Promise<Sealed> {
  const theirs = await subtle().importKey("jwk", publicKey, CURVE, false, [])
  const pair = await subtle().generateKey(CURVE, true, ["deriveBits"])
  const shared = await subtle().deriveBits({ name: "ECDH", public: theirs }, pair.privateKey, 256)

  const iv = random(12)
  const key = await deriveKey(shared, "zolace/item/v1")
  const data = await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text))

  return {
    epk: publicPart(await subtle().exportKey("jwk", pair.publicKey)),
    iv: toBase64Url(iv),
    data: toBase64Url(new Uint8Array(data)),
  }
}

// Browser, on the order page: the item, or an error if the secret is not the one that made it.
export async function openSealed(secret: string, wrappedKey: Wrapped, sealed: Sealed) {
  const lock = await deriveKey(fromBase64Url(secret), "zolace/wrap/v1")
  const pkcs8 = await subtle().decrypt(
    { name: "AES-GCM", iv: fromBase64Url(wrappedKey.iv) },
    lock,
    fromBase64Url(wrappedKey.data)
  )
  const mine = await subtle().importKey("pkcs8", pkcs8, CURVE, false, ["deriveBits"])
  const theirs = await subtle().importKey("jwk", sealed.epk, CURVE, false, [])
  const shared = await subtle().deriveBits({ name: "ECDH", public: theirs }, mine, 256)

  const key = await deriveKey(shared, "zolace/item/v1")
  const text = await subtle().decrypt(
    { name: "AES-GCM", iv: fromBase64Url(sealed.iv) },
    key,
    fromBase64Url(sealed.data)
  )
  return new TextDecoder().decode(text)
}

// What a public key from a request must look like before the server uses it.
export function isPublicKey(value: unknown): value is PublicKey {
  if (typeof value !== "object" || value === null) return false
  const key = value as Record<string, unknown>
  const coordinate = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v)
  return key.kty === "EC" && key.crv === "P-256" && coordinate(key.x) && coordinate(key.y)
}

export function isWrapped(value: unknown): value is Wrapped {
  if (typeof value !== "object" || value === null) return false
  const blob = value as Record<string, unknown>
  const field = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v)
  return field(blob.iv, 24) && field(blob.data, 400)
}
