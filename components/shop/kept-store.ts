"use client"

import { useSyncExternalStore } from "react"

import { KEPT_KEY, readKept, withKept, withoutKept, type Kept } from "@/lib/kept"

// The browser's side of the kept orders (lib/kept.ts): the list in this browser's own storage,
// and the two ways to change it. Nothing here talks to the server.

// Other tabs tell of a change through the browser's own "storage" event; this tab tells itself.
const CHANGED = "zolace:kept"

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGED, onChange)
  }
}

// A browser can refuse its storage (a private window, a setting). Then nothing is kept.
function stored() {
  try {
    return window.localStorage.getItem(KEPT_KEY)
  } catch {
    return null
  }
}

function write(list: Kept[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(KEPT_KEY)
    else window.localStorage.setItem(KEPT_KEY, JSON.stringify(list))
    window.dispatchEvent(new Event(CHANGED))
    return true
  } catch {
    return false
  }
}

// The text in the storage is what React compares, so the list is only read again when it changed.
let lastText: string | null = null
let lastList: Kept[] = []
function snapshot() {
  const text = stored()
  if (text !== lastText) {
    lastText = text
    lastList = readKept(text)
  }
  return lastList
}
const NONE: Kept[] = []

// The orders this browser keeps, newest first. Empty on the server and until the page is awake.
export const useKept = () => useSyncExternalStore(subscribe, snapshot, () => NONE)

// False when the order is not a whole one, or the browser would not store it.
export function keep(order: Kept) {
  const next = withKept(readKept(stored()), order)
  return next ? write(next) : false
}

export const forget = (id: string) => write(withoutKept(readKept(stored()), id))

export const forgetAll = () => write([])
