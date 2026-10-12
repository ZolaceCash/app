"use server"

import type { FormState } from "@/components/owner/action-form"
import { noticesOn, sendNotice } from "@/lib/owner-notify"
import { isOwner } from "@/lib/owner-session"

// The owner asks for one line to be sent to the notice address, to see that it arrives. Like every
// action of the owner's screens, it checks the session itself before it does anything.
export async function testNotice(): Promise<FormState> {
  if (!(await isOwner())) return { error: "You are signed out. Sign in again." }
  if (!noticesOn()) return { error: "No notice address is set on this server (OWNER_NOTIFY_URL)." }
  const sent = await sendNotice("Zolace: a test notice. If you read this, notices reach you.")
  return sent ? { ok: "Sent. It should be on your phone now." } : { error: "It did not go out. Check the address and try again." }
}
