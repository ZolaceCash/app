"use client"

import { useActionState, type ComponentProps, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// What an owner's action answers with: one line, said under the form.
export type FormState = { ok?: string; error?: string }

// A form on the owner's screens: its fields, one button, and the answer of the last attempt.
export function ActionForm({
  action,
  label,
  busyLabel,
  variant,
  size,
  className,
  children,
}: {
  action: (previous: FormState, form: FormData) => Promise<FormState>
  label: string
  busyLabel?: string
  className?: string
  children?: ReactNode
} & Pick<ComponentProps<typeof Button>, "variant" | "size">) {
  const [state, formAction, busy] = useActionState(action, {})

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={busy} variant={variant} size={size}>
          {busy ? (busyLabel ?? label) : label}
        </Button>
        <p
          aria-live="polite"
          className={cn("text-sm leading-snug", state.error ? "text-destructive" : "text-muted-foreground")}
        >
          {state.error ?? state.ok}
        </p>
      </div>
    </form>
  )
}
