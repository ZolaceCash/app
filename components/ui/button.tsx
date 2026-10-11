import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Every button is a small rounded block with a mono label. No variant draws a border, a ring or a
// glow at rest.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg font-mono text-[0.6875rem] font-medium tracking-[0.08em] whitespace-nowrap uppercase transition-[background-color,color,box-shadow,transform] duration-200 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_14%)]",
        inverse:
          "bg-foreground text-background hover:bg-[color-mix(in_oklch,var(--foreground),var(--background)_14%)]",
        ink: "bg-ink text-white hover:bg-ink/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_7%)] aria-expanded:bg-secondary",
        outline:
          "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1] aria-expanded:bg-foreground/[0.1]",
        ghost:
          "text-foreground hover:bg-foreground/[0.06] aria-expanded:bg-foreground/[0.06]",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-5",
        xs: "h-6 gap-1 px-2.5 text-[0.625rem] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5",
        lg: "h-12 gap-2.5 px-7",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
