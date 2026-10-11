"use client"

import { useRef, useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useInView } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"

export type Step = {
  name: string
  badge: string
  body: string
  points: string[]
  // The drawing of the screen for this step, rendered on the server.
  screen: ReactNode
}

// The four steps as a list on the left and the screen of the chosen step on the right.
// Until someone picks a step the list walks through them: the bar under the open step fills up
// (`.auto-fill` in app/globals.css) and the end of that animation opens the next one. The bar
// stops while the pointer is on the list or the section is off screen. With reduced motion it
// still walks, and the screen fades in without sliding.
export function StepExplorer({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(0)
  const [walking, setWalking] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  const visible = useInView(root, 0.35)

  return (
    <Tabs
      ref={root}
      orientation="vertical"
      value={String(open)}
      onValueChange={(value) => {
        setOpen(Number(value))
        setWalking(false)
      }}
      className="grid gap-2.5 cut rounded-3xl bg-card p-2.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <TabsList aria-label="The steps of an order" className="group/steps gap-1 p-1 md:p-3">
        {steps.map((step, index) => {
          const on = index === open
          return (
            <TabsTrigger
              key={step.name}
              value={String(index)}
              className={cn(
                "relative w-full overflow-hidden rounded-2xl px-5 py-5 text-left",
                on ? "bg-secondary" : "hover:bg-secondary/50"
              )}
            >
              <span className="flex items-center gap-4">
                <span className={cn("label-mono", on ? "text-brand" : "text-muted-foreground")}>
                  0{index + 1}
                </span>
                <span
                  className={cn(
                    "text-2xl leading-none font-medium tracking-[-0.035em] transition-colors duration-300",
                    !on && "text-muted-foreground"
                  )}
                >
                  {step.name}
                </span>
                <Badge
                  variant={on ? "default" : "secondary"}
                  className="label-mono ml-auto h-auto px-2.5 py-1 text-[0.625rem]"
                >
                  {step.badge}
                </Badge>
              </span>

              {/* Opens by growing its grid row, so the height eases instead of jumping. */}
              <span
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-500 ease-out",
                  on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <span className="block overflow-hidden">
                  <span className="block pt-4 pl-[2.375rem] leading-relaxed text-pretty whitespace-normal text-muted-foreground">
                    {step.body}
                  </span>
                  <span className="flex flex-wrap gap-1.5 pt-4 pb-1 pl-[2.375rem]">
                    {step.points.map((point) => (
                      <span
                        key={point}
                        className="label-mono rounded-md bg-background/60 px-2.5 py-1.5 text-[0.625rem]"
                      >
                        {point}
                      </span>
                    ))}
                  </span>
                </span>
              </span>

              {on && walking ? (
                <span
                  aria-hidden
                  onAnimationEnd={() => setOpen((index + 1) % steps.length)}
                  style={{ animationPlayState: visible ? undefined : "paused" }}
                  className="auto-fill absolute inset-x-0 bottom-0 h-1 bg-primary group-hover/steps:[animation-play-state:paused]"
                />
              ) : null}
            </TabsTrigger>
          )
        })}
      </TabsList>

      <div className="flex min-h-[25rem] items-center justify-center rounded-2xl bg-background p-5 md:p-10">
        {steps.map((step, index) => (
          <TabsContent
            key={step.name}
            value={String(index)}
            className="w-full max-w-[26rem] animate-in duration-500 fade-in-0 slide-in-from-bottom-3 motion-reduce:slide-in-from-bottom-0"
          >
            {step.screen}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
