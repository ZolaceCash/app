import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { isSession } from "@/lib/owner"

// The cookie that carries the owner's session. It is only sent to the owner's screens.
export const OWNER_COOKIE = "zolace_owner"
export const OWNER_PATH = "/owner"

export async function isOwner() {
  const token = (await cookies()).get(OWNER_COOKIE)?.value
  // A session is checked against the clock, so this is never worked out ahead of a request.
  await connection()
  return isSession(token)
}

// Every owner's screen and every action behind one calls this before it reads or changes
// anything. It is the only thing between a visitor and those rows: there is no second gate in
// front of the routes. A screen that only hides its buttons protects nothing: an action can be called
// without the screen.
export async function requireOwner() {
  if (!(await isOwner())) redirect("/owner/login")
}
